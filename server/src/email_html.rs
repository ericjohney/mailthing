use anyhow::Result;
use mailparse::ParsedMail;

/// Preserve email presentation inside a script-disabled, CSP-restricted document.
/// CSS is intentionally retained; this fragment must never enter the app's DOM.
pub fn sanitize(html: &str) -> String {
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
        .url_relative(ammonia::UrlRelative::Deny)
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
