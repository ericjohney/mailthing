//! Plain-text inbox previews; never render email HTML in the application DOM.
use html5ever::{
    tendril::StrTendril,
    tokenizer::{
        BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, states::RawKind,
    },
};
use std::cell::RefCell;

#[derive(Default)]
struct TextSink {
    text: RefCell<String>,
    excluded: RefCell<Vec<String>>,
}

impl TokenSink for TextSink {
    type Handle = ();

    fn process_token(&self, token: Token, _: u64) -> TokenSinkResult<()> {
        match token {
            Token::CharacterTokens(text) if self.excluded.borrow().is_empty() => {
                self.text.borrow_mut().push_str(&text);
            }
            Token::TagToken(tag) => {
                let name = tag.name.as_ref();
                if matches!(name, "head" | "title" | "style" | "script") {
                    let mut excluded = self.excluded.borrow_mut();
                    if tag.kind == TagKind::StartTag {
                        excluded.push(name.to_owned());
                    } else if let Some(index) = excluded.iter().rposition(|value| value == name) {
                        excluded.truncate(index);
                    }
                }
                if self.excluded.borrow().is_empty()
                    && matches!(
                        name,
                        "br" | "p"
                            | "div"
                            | "td"
                            | "th"
                            | "tr"
                            | "li"
                            | "table"
                            | "h1"
                            | "h2"
                            | "h3"
                            | "blockquote"
                            | "hr"
                    )
                {
                    self.text.borrow_mut().push('\n');
                }
                if tag.kind == TagKind::StartTag {
                    match name {
                        "script" => return TokenSinkResult::RawData(RawKind::ScriptData),
                        "style" => return TokenSinkResult::RawData(RawKind::Rawtext),
                        "title" => return TokenSinkResult::RawData(RawKind::Rcdata),
                        _ => {}
                    }
                }
            }
            _ => {}
        }
        TokenSinkResult::Continue
    }
}

/// Decode entities and retain spacing between HTML blocks without CSS or scripts.
pub fn html_text(html: &str) -> String {
    let input = BufferQueue::default();
    input.push_back(StrTendril::from(html));
    let tokenizer = Tokenizer::new(TextSink::default(), Default::default());
    let _ = tokenizer.feed(&input);
    tokenizer.end();
    tokenizer.sink.text.into_inner()
}

fn body_text(text: &str, depth: usize) -> String {
    let text = text.trim();
    // Some senders embed a MIME part in text/plain. Decode only a leading MIME
    // header block, so ordinary prose mentioning Content-Type remains intact.
    if depth < 3
        && (text.contains("\n\n") || text.contains("\r\n\r\n"))
        && (text.to_ascii_lowercase().starts_with("content-type:")
            || text.to_ascii_lowercase().starts_with("mime-version:"))
        && let Ok(part) = mailparse::parse_mail(text.as_bytes())
        && part
            .headers
            .iter()
            .any(|h| h.get_key().eq_ignore_ascii_case("content-type"))
        && (matches!(part.ctype.mimetype.as_str(), "text/plain" | "text/html")
            || part.ctype.mimetype.starts_with("multipart/"))
    {
        fn collect(part: &mailparse::ParsedMail<'_>, depth: usize) -> String {
            let disposition = part.get_content_disposition();
            if disposition.disposition == mailparse::DispositionType::Attachment
                || disposition.params.contains_key("filename")
                || part.ctype.params.contains_key("name")
            {
                return String::new();
            }
            if !part.subparts.is_empty() {
                if part.ctype.mimetype == "multipart/alternative" {
                    // Alternatives describe the same body; do not repeat it.
                    let plain = part
                        .subparts
                        .iter()
                        .find(|p| p.ctype.mimetype == "text/plain")
                        .map(|p| collect(p, depth))
                        .unwrap_or_default();
                    if !plain.trim().is_empty() {
                        return plain;
                    }
                    return part
                        .subparts
                        .iter()
                        .map(|p| collect(p, depth))
                        .find(|body| !body.trim().is_empty())
                        .unwrap_or_default();
                }
                return part
                    .subparts
                    .iter()
                    .map(|p| collect(p, depth))
                    .collect::<Vec<_>>()
                    .join("\n");
            }
            let body = part.get_body().unwrap_or_default();
            match part.ctype.mimetype.as_str() {
                "text/html" => html_text(&body),
                "text/plain" => body_text(&body, depth + 1),
                _ => String::new(),
            }
        }
        return collect(&part, depth);
    }
    let lower = text.to_ascii_lowercase();
    if [
        "<!doctype html",
        "<html",
        "<body",
        "<div",
        "<p>",
        "<p ",
        "<table",
        "<style",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
    {
        html_text(text)
    } else {
        // Escape literal angle brackets before decoding entities in plain text.
        // A message such as `Use <invoice-id>` must not lose its placeholder.
        html_text(&text.replace('<', "&lt;").replace('>', "&gt;"))
    }
}

pub fn snippet(text: &str, html: &str) -> String {
    let body = body_text(text, 0);
    let body = if body.trim().is_empty() {
        html_text(html)
    } else {
        body
    };
    fn invisible(c: char) -> bool {
        matches!(
            c,
            '\u{034f}' | '\u{200b}' | '\u{200c}' | '\u{2060}' | '\u{feff}' | '\u{00ad}'
        )
    }
    let chars = body.chars().collect::<Vec<_>>();
    chars
        .iter()
        .enumerate()
        .filter(|(index, c)| {
            !invisible(**c)
                && (**c != '\u{200d}'
                    || (index
                        .checked_sub(1)
                        .and_then(|i| chars.get(i))
                        .is_some_and(|c| !c.is_whitespace() && !invisible(*c))
                        && chars
                            .get(index + 1)
                            .is_some_and(|c| !c.is_whitespace() && !invisible(*c))))
        })
        .map(|(_, c)| *c)
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(180)
        .collect()
}
