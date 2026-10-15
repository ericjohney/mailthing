use anyhow::Result;
use html5ever::{
    tendril::StrTendril,
    tokenizer::{
        BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, states::RawKind,
    },
};
use mailparse::ParsedMail;
use std::cell::RefCell;

/// Read the first base href using HTML tokenization, not text matching: comments
/// and raw text (scripts, styles, etc.) must not supply a document's base URL.
fn document_base(html: &str) -> Option<reqwest::Url> {
    #[derive(Default)]
    struct BaseSink(RefCell<Option<String>>);
    impl TokenSink for BaseSink {
        type Handle = ();
        fn process_token(&self, token: Token, _: u64) -> TokenSinkResult<()> {
            if let Token::TagToken(tag) = token
                && tag.kind == TagKind::StartTag
            {
                if &*tag.name == "base"
                    && self.0.borrow().is_none()
                    && let Some(href) = tag.attrs.iter().find(|a| &*a.name.local == "href")
                {
                    *self.0.borrow_mut() = Some(href.value.to_string());
                }
                match tag.name.as_ref() {
                    "script" => return TokenSinkResult::RawData(RawKind::ScriptData),
                    "style" | "xmp" | "iframe" | "noembed" | "noframes" => {
                        return TokenSinkResult::RawData(RawKind::Rawtext);
                    }
                    "title" | "textarea" => return TokenSinkResult::RawData(RawKind::Rcdata),
                    _ => {}
                }
            }
            TokenSinkResult::Continue
        }
    }
    let input = BufferQueue::default();
    input.push_back(StrTendril::from(html));
    let tokenizer = Tokenizer::new(BaseSink::default(), Default::default());
    let _ = tokenizer.feed(&input);
    tokenizer.end();
    let base = reqwest::Url::parse(tokenizer.sink.0.into_inner()?.trim()).ok()?;
    matches!(base.scheme(), "http" | "https").then_some(base)
}

/// Preserve email presentation inside a script-disabled, CSP-restricted document.
/// CSS is intentionally retained; this fragment must never enter the app's DOM.
pub fn sanitize(html: &str) -> String {
    let relative = document_base(html)
        .map(ammonia::UrlRelative::RewriteWithBase)
        .unwrap_or(ammonia::UrlRelative::Deny);
    ammonia::Builder::default()
        .add_tags(&["style", "center", "font"])
        .rm_clean_content_tags(&["style"])
        .add_generic_attributes(&["style", "class", "dir", "width", "height"])
        .add_tag_attributes(
            "table",
            &["cellpadding", "cellspacing", "border", "bgcolor"],
        )
        .add_tag_attributes("td", &["bgcolor", "valign"])
        .add_tag_attributes("th", &["bgcolor", "valign"])
        .add_tag_attributes("font", &["color", "face", "size"])
        .url_schemes(["https", "http", "mailto"].into())
        .url_relative(relative)
        .link_rel(Some("noopener noreferrer"))
        .set_tag_attribute_value("a", "target", "_blank")
        .clean(html)
        .to_string()
}

/// Re-render saved MIME without reimporting mail or changing mailbox state.
pub fn from_raw(raw: &[u8]) -> Result<String> {
    fn collect(part: &ParsedMail<'_>, html: &mut String) -> Result<()> {
        let disposition = part.get_content_disposition();
        if disposition.disposition == mailparse::DispositionType::Attachment
            || disposition.params.contains_key("filename")
            || part.ctype.params.contains_key("name")
        {
            return Ok(());
        }
        if part.subparts.is_empty() && part.ctype.mimetype == "text/html" {
            html.push_str(&part.get_body()?);
        } else {
            for child in &part.subparts {
                collect(child, html)?;
            }
        }
        Ok(())
    }
    let mut html = String::new();
    collect(&mailparse::parse_mail(raw)?, &mut html)?;
    Ok(sanitize(&html))
}
