use mailthing::email_html;

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
