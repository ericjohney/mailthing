use mailthing::preview::{html_text, snippet};

#[test]
fn html_entities_blocks_and_preheader_padding_become_readable_text() {
    assert_eq!(
        snippet(
            "",
            "<p>Get the scoop on Computer &amp; Office&nbsp;&#8204;&#x200b;&#847; &nbsp;</p><div>Save <b>20%</b> today &#x2713;</div>"
        ),
        "Get the scoop on Computer & Office Save 20% today ✓"
    );
    assert_eq!(
        html_text("<p>One</p><p>Two<br>Three</p>")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" "),
        "One Two Three"
    );
}

#[test]
fn html_head_css_scripts_comments_and_attributes_are_not_preview_text() {
    let html = "<!doctype html><html><head><title>Document title</title><style>p { display: none }</style></head><body><!-- tracking --><p>Actual message</p><script>if (a < b) alert('bad')</script><img alt='Tracking' src='https://example.com/x'></body></html>";
    assert_eq!(snippet("", html), "Actual message");
    assert_eq!(snippet(html, ""), "Actual message");
}

#[test]
fn embedded_mime_headers_and_transfer_encoding_are_decoded() {
    let text = "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nYour delivery is scheduled =E2=9C=93";
    assert_eq!(snippet(text, ""), "Your delivery is scheduled ✓");
    let multipart = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=part\r\n\r\n--part\r\nContent-Type: text/html\r\n\r\n<p>Your &amp; my order</p>\r\n--part\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=note.txt\r\n\r\nPrivate attachment\r\n--part--";
    assert_eq!(snippet(multipart, ""), "Your & my order");
}

#[test]
fn plain_text_placeholders_inline_markup_and_header_prose_survive() {
    assert_eq!(
        snippet(
            "Use <invoice-id>; 2 < 3 & 5 > 4.\nContent-Type: explains the header.",
            "<p>Other alternative</p>"
        ),
        "Use <invoice-id>; 2 < 3 & 5 > 4. Content-Type: explains the header."
    );
    assert_eq!(
        snippet("Content-Type: is the field to check", ""),
        "Content-Type: is the field to check"
    );
    assert_eq!(snippet("Hello &amp; goodbye", ""), "Hello & goodbye");
    assert_eq!(snippet("Hello 👩‍💻", ""), "Hello 👩‍💻");
    assert_eq!(
        snippet(
            "Your statement \u{200d}\u{034f} \u{200d}\u{034f} is ready",
            ""
        ),
        "Your statement is ready"
    );
}

#[test]
fn snippets_limit_unicode_characters_after_cleanup_and_fall_back_to_html() {
    let text = "✓".repeat(200);
    assert_eq!(snippet(&text, "").chars().count(), 180);
    assert_eq!(snippet("  \n", "<p>Fallback</p>"), "Fallback");
}
