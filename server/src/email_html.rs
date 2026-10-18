use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD};
use html5ever::{
    tendril::StrTendril,
    tokenizer::{
        BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer, states::RawKind,
    },
};
use mailparse::{MailHeaderMap, ParsedMail};
use std::{cell::RefCell, collections::HashMap};

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
    sanitize_with_images(html, HashMap::new())
}

fn sanitize_with_images(html: &str, images: HashMap<String, String>) -> String {
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
        .url_schemes(["https", "http", "mailto", "cid"].into())
        .attribute_filter(move |tag, attribute, value| {
            if let Some((scheme, id)) = value.trim().split_once(':')
                && scheme.eq_ignore_ascii_case("cid")
            {
                // Only MIME-backed image sources may become data URLs. Do not
                // enable arbitrary data URLs or CID navigation in email HTML.
                return (tag == "img" && attribute == "src")
                    .then(|| images.get(&decode_content_id(id)?).cloned())
                    .flatten()
                    .map(Into::into);
            }
            Some(value.into())
        })
        .url_relative(relative)
        .link_rel(Some("noopener noreferrer"))
        .set_tag_attribute_value("a", "target", "_blank")
        .clean(html)
        .to_string()
}

// RFC 2392 permits URL-escaped Content-IDs; '+' is literal, not form encoding.
fn decode_content_id(id: &str) -> Option<String> {
    let mut decoded = Vec::with_capacity(id.len());
    let mut bytes = id.bytes();
    while let Some(byte) = bytes.next() {
        decoded.push(if byte == b'%' {
            let high = (bytes.next()? as char).to_digit(16)?;
            let low = (bytes.next()? as char).to_digit(16)?;
            (high * 16 + low) as u8
        } else {
            byte
        });
    }
    String::from_utf8(decoded).ok()
}

/// Re-render saved MIME without reimporting mail or changing mailbox state.
pub fn from_raw(raw: &[u8]) -> Result<String> {
    fn collect(
        part: &ParsedMail<'_>,
        html: &mut String,
        images: &mut HashMap<String, String>,
    ) -> Result<()> {
        // Inline images commonly have a filename, including Gmail-forwarded
        // Outlook signatures. Resolve these before excluding file attachments.
        if part.subparts.is_empty()
            && matches!(
                part.ctype.mimetype.as_str(),
                "image/png"
                    | "image/jpeg"
                    | "image/gif"
                    | "image/webp"
                    | "image/bmp"
                    | "image/avif"
            )
            && let Some(id) = part.headers.get_first_value("Content-ID")
        {
            let id = id.trim().trim_start_matches('<').trim_end_matches('>');
            if !id.is_empty() {
                images.entry(id.to_string()).or_insert(format!(
                    "data:{};base64,{}",
                    part.ctype.mimetype,
                    STANDARD.encode(part.get_body_raw()?)
                ));
            }
            return Ok(());
        }
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
                collect(child, html, images)?;
            }
        }
        Ok(())
    }
    let mut html = String::new();
    let mut images = HashMap::new();
    collect(&mailparse::parse_mail(raw)?, &mut html, &mut images)?;
    Ok(sanitize_with_images(&html, images))
}
