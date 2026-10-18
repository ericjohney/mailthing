use mailthing::email_html;

const INLINE_LOGO: &str = include_str!("fixtures/inline-logo.eml");

#[test]
fn restores_forwarded_inline_logo_with_filename_from_saved_mime() {
    let rendered = email_html::render(INLINE_LOGO.as_bytes()).unwrap();
    assert_eq!(rendered.inline_attachment_indices, [0].into());
    let html = rendered.html;
    assert!(
        html.contains("src=\"data:image/png;base64,iVBORw0KGgo"),
        "{html}"
    );
    assert!(html.contains("alt=\"Company logo\""));
    assert!(html.contains("style=\"width:372px;max-width:100%\""));
    assert!(!html.contains("cid:"));
}

#[test]
fn only_hides_images_actually_used_in_the_sanitized_body() {
    for replacement in [
        "<img src='cid:missing'>",
        "<a href='cid:ii_logo'>Logo</a>",
        "<!-- <img src='cid:ii_logo'> -->",
        "<script>const image = '<img src=\"cid:ii_logo\">';</script>",
        "<iframe><img src='cid:ii_logo'></iframe>",
    ] {
        let raw = INLINE_LOGO.replace(
            "<img src=\"cid:ii_logo\" alt=\"Company logo\" style=\"width:372px;max-width:100%\">",
            replacement,
        );
        let rendered = email_html::render(raw.as_bytes()).unwrap();
        assert!(
            rendered.inline_attachment_indices.is_empty(),
            "{replacement}"
        );
    }
    let raw = INLINE_LOGO.replace("cid:ii_logo", "CID:ii%5Flogo");
    let rendered = email_html::render(raw.as_bytes()).unwrap();
    assert_eq!(rendered.inline_attachment_indices, [0].into());
}

#[test]
fn resolves_escaped_content_ids_but_rejects_unbacked_and_active_sources() {
    let raw = INLINE_LOGO.replace(
        "cid:ii_logo\"",
        "CID:ii%5Flogo\"><img src=\"cid:missing\"><img src=\"cid:ii%ZZlogo\"><img src=\"data:text/html;base64,PHNjcmlwdD4=\"><a href=\"cid:ii_logo\">download</a><img src=\"https://images.example/remote.png\" onerror=\"alert(1)\"",
    );
    let html = email_html::from_raw(raw.as_bytes()).unwrap();
    assert_eq!(html.matches("src=\"data:image/png;base64,").count(), 1);
    assert!(html.contains("https://images.example/remote.png"));
    for denied in ["cid:", "CID:", "data:text/html", "onerror"] {
        assert!(!html.contains(denied), "{html}");
    }

    for content_type in ["image/svg+xml", "text/html", "application/pdf"] {
        let raw = INLINE_LOGO.replace("image/png", content_type);
        let html = email_html::from_raw(raw.as_bytes()).unwrap();
        assert!(!html.contains("src="), "{html}");
    }
    assert!(!email_html::sanitize("<img src='cid:ii_logo'><a href='cid:ii_logo'>link</a><img src='data:image/png;base64,AAAA'>").contains("src="));
}

#[test]
fn does_not_resolve_images_from_attached_messages() {
    let raw = format!(
        "Content-Type: multipart/mixed; boundary=outer\r\n\r\n--outer\r\nContent-Type: text/html\r\n\r\n<img src='cid:ii_logo'>\r\n--outer\r\nContent-Type: message/rfc822\r\nContent-Disposition: attachment; filename=forwarded.eml\r\n\r\n{INLINE_LOGO}\r\n--outer--\r\n"
    );
    let html = email_html::from_raw(raw.as_bytes()).unwrap();
    assert!(!html.contains("src="));
    assert!(!html.contains("Your inspection"));
}

#[test]
fn resolves_parking_scan_code_against_email_base_without_retaining_base_tag() {
    let raw = b"Content-Type: text/html; charset=utf-8\r\n\r\n<head><BASE HREF=\"https://parking.example/Email/\"></head><body><img src=\"/Email/%20GenerateBarCode?barcodeNum=TEST123&amp;format=aztec\" alt=\"aztec code\"><img src=\"../Content/logo.png\"><a href=\"reservation/123\">Pass</a><script>alert(1)</script></body>";
    let html = email_html::from_raw(raw).unwrap();
    assert!(html.contains("src=\"https://parking.example/Email/%20GenerateBarCode?barcodeNum=TEST123&amp;format=aztec\""), "{html}");
    assert!(html.contains("src=\"https://parking.example/Content/logo.png\""));
    assert!(html.contains("href=\"https://parking.example/Email/reservation/123\""));
    assert!(!html.contains("<base"));
    assert!(!html.contains("<script"));
}

#[test]
fn refuses_unsafe_or_missing_bases_and_ignores_fake_base_tags() {
    for base in [
        "",
        "<base href='javascript:alert(1)'>",
        "<base href='file:///private/'>",
        "<base href='/relative/'>",
        "<!-- <base href='https://fake.example/'> -->",
        "<script>const x = '<base href=\"https://fake.example/\">';</script>",
        "<style>/* <base href='https://fake.example/'> */</style>",
        "<textarea><base href='https://fake.example/'></textarea>",
    ] {
        let html = email_html::sanitize(&format!(
            "{base}<img src='/code.png'><a href='javascript:alert(1)'>bad</a>"
        ));
        assert!(!html.contains("src="), "{html}");
        assert!(!html.contains("<a href="), "{html}");
    }
    let html = email_html::sanitize(
        "<base href='javascript:bad'><base href='https://later.example/'><img src='/code.png'>",
    );
    assert!(!html.contains("src="), "first base must win: {html}");
    let html = email_html::sanitize(
        "<base href='https://parking.example/?a=1&amp;b=2'><img src='//images.example/code.png'><img src='javascript:bad'>",
    );
    assert!(html.contains("src=\"https://images.example/code.png\""));
    assert!(!html.contains("javascript:"));
}

#[test]
fn preserves_email_layout_without_active_content() {
    let html = email_html::sanitize(
        r##"<html><head><style>.offer { color:#f00 } @media (max-width:600px) { .offer { font-size:20px } }</style><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/style.css"></head><body><div style="display:none">preview padding</div><table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff"><tr><td valign="top" style="padding:24px"><img src="https://images.example/product.png" width="140" height="140" onerror="alert(1)"><p class="offer" style="font-size:24px">$55.29</p><a href="javascript:alert(1)">bad</a><a href="https://example.com">Shop</a><script>alert(1)</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form></td></tr></table></body></html>"##,
    );
    for presentation in [
        "<style>",
        "@media",
        "display:none",
        "width=\"600\"",
        "cellpadding=\"0\"",
        "bgcolor=\"#ffffff\"",
        "padding:24px",
        "class=\"offer\"",
        "font-size:24px",
        "https://images.example/product.png",
        "target=\"_blank\"",
        "noopener noreferrer",
    ] {
        assert!(
            html.contains(presentation),
            "missing {presentation}: {html}"
        );
    }
    for active in [
        "<script",
        "onerror",
        "javascript:",
        "<iframe",
        "<form",
        "<input",
        "<meta",
        "<link",
        "evil.example",
    ] {
        assert!(!html.contains(active), "retained {active}: {html}");
    }
}

#[test]
fn restores_mime_html_and_skips_attached_html() {
    let raw = b"MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=m\r\n\r\n--m\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p style=3D\"color:red\">An offer =E2=9C=93</p>\r\n--m\r\nContent-Type: text/html\r\nContent-Disposition: attachment; filename=offer.html\r\n\r\n<p>Do not render this attachment</p>\r\n--m--\r\n";
    let html = email_html::from_raw(raw).unwrap();
    assert!(html.contains("style=\"color:red\""));
    assert!(html.contains("An offer ✓"));
    assert!(!html.contains("Do not render"));
}
