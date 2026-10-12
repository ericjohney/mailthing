import XCTest
import WebKit
@testable import Mailthing

final class MailthingTests: XCTestCase {
    func testPrivateServerURLRequiresTLSAndNoCredentials() throws {
        XCTAssertEqual(try MailAPI.serverURL("https://mailthing.ericj5.com").host, "mailthing.ericj5.com")
        XCTAssertNoThrow(try MailAPI.serverURL("http://localhost:9005"))
        for address in ["http://mailthing.ericj5.com", "https://user:password@example.com", "https://example.com/api", "https://example.com?token=x", "https://example.com#part", "mailthing.ericj5.com"] {
            XCTAssertThrowsError(try MailAPI.serverURL(address), address)
        }
    }
    func testThreadDecodesServerLabelAndTimestampFields() throws {
        let json = #"{"id":"t","subject":"Hello","sender":"Sam","sender_email":"sam@example.net","snippet":"A message","received_at":1700000000000,"count":2,"unread":1,"has_attachment":true,"label_ids":["INBOX","STARRED"]}"#
        let thread = try JSONDecoder.mailthing.decode(MailThread.self, from: Data(json.utf8))
        XCTAssertTrue(thread.starred)
        XCTAssertTrue(thread.hasAttachment)
        XCTAssertEqual(thread.date.timeIntervalSince1970, 1700000000)
        XCTAssertEqual(thread.senderEmail, "sam@example.net")
    }
    func testDraftWireFormatMatchesServerAndRetainsAttachment() throws {
        var draft = Draft(); draft.to = "sam@example.net"; draft.inReplyTo = "<original@example.net>"
        draft.attachments = [.init(name: "note.txt", contentType: "text/plain", data: Data("hi".utf8).base64EncodedString())]
        let data = try JSONEncoder.mailthing.encode(draft)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["in_reply_to"] as? String, "<original@example.net>")
        XCTAssertEqual((json["updated_at"] as? NSNumber)?.int64Value, draft.updatedAt)
        XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("\"updated_at\":\(draft.updatedAt)."), "Rust requires integer millisecond timestamps")
        let decoded = try JSONDecoder.mailthing.decode(Draft.self, from: data)
        XCTAssertEqual(decoded.attachments.first?.contentType, "text/plain")
        XCTAssertTrue(decoded.hasContent)
    }
    func testReplyAllExcludesOwnerAndSender() {
        let message = MailMessage(id: "m", threadId: "t", messageId: "<m@example.net>", subject: "Weekend", sender: "Sam", senderEmail: "sam@example.net", recipients: "Eric <eric@example.com>, Friend <friend@example.com>", cc: "sam@example.net", text: "Hello\nWorld", html: "", receivedAt: 0, labels: [])
        let reply = Draft.reply(to: message, all: true, accountEmail: "eric@example.com")
        XCTAssertEqual(reply.to, "sam@example.net")
        XCTAssertEqual(reply.cc, "Friend <friend@example.com>")
        XCTAssertEqual(reply.subject, "Re: Weekend")
        XCTAssertEqual(reply.inReplyTo, message.messageId)
        XCTAssertTrue(reply.body.contains("> Hello\n> World"))
    }
    func testHTMLDisallowsNetworkImagesScriptsAndForms() {
        let document = SafeEmailHTML.document("<p>Hello</p>")
        XCTAssertTrue(document.contains("default-src 'none'"))
        XCTAssertTrue(document.contains("img-src data:"))
        XCTAssertTrue(document.contains("form-action 'none'"))
        XCTAssertTrue(document.contains("script-src 'none'"))
        XCTAssertTrue(SafeEmailHTML.document("<img src='https://example.com/image'>", showImages: true).contains("img-src https: http: data:"))
    }

    @MainActor
    func testHTMLFitsFixedWidthEmailAndRecalculatesAfterLayoutChanges() async throws {
        let renderer = SafeEmailHTML(html: "")
        let coordinator = renderer.makeCoordinator()
        let web = renderer.makeWebView(coordinator: coordinator)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 350, height: 800))
        let controller = UIViewController()
        window.rootViewController = controller
        controller.view.addSubview(web)
        web.frame = window.bounds
        window.makeKeyAndVisible()
        defer { SafeEmailHTML.dismantleUIView(web, coordinator: coordinator); window.isHidden = true }
        XCTAssertFalse(web.configuration.defaultWebpagePreferences.allowsContentJavaScript)
        let html = "<style>.offer { color:rgb(255,0,0) }</style><div style='display:none'>hidden padding</div><table width='600' style='width:600px'><tr><td><p class='offer'>Product details</p><div style='height:1200px'>Long email</div></td></tr></table><script>window.emailScriptExecuted = true</script>"
        web.loadHTMLString(SafeEmailHTML.document(html), baseURL: nil)
        for _ in 0..<100 {
            if coordinator.measuredHeight > 600 { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertGreaterThan(coordinator.measuredHeight, 600, "The trusted layout script must run even though email scripts are disabled")
        let result = try await evaluate(web, "({width:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth, hidden:getComputedStyle(document.querySelector('[style*=none]')).display, color:getComputedStyle(document.querySelector('.offer')).color, executed:window.emailScriptExecuted === true})")
        let metrics = try XCTUnwrap(result as? [String: Any], "Unexpected JavaScript result: \(String(describing: result))")
        XCTAssertLessThanOrEqual((metrics["width"] as! NSNumber).doubleValue, (metrics["viewport"] as! NSNumber).doubleValue + 1)
        XCTAssertEqual(metrics["hidden"] as? String, "none")
        XCTAssertEqual(metrics["color"] as? String, "rgb(255, 0, 0)")
        XCTAssertEqual(metrics["executed"] as? Bool, false)
        let before = coordinator.measuredHeight
        _ = try await evaluate(web, "document.querySelector('td').insertAdjacentHTML('beforeend', '<div style=\"height:600px\">Image arriving later</div>')")
        for _ in 0..<50 {
            if coordinator.measuredHeight > before + 250 { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertGreaterThan(coordinator.measuredHeight, before + 250)
        web.frame.size.width = 280
        for _ in 0..<50 {
            if coordinator.measuredHeight < before + 200 { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let widthResult = try await evaluate(web, "document.documentElement.scrollWidth")
        let width = try XCTUnwrap(widthResult as? NSNumber)
        XCTAssertLessThanOrEqual(width.doubleValue, 281)
    }
    @MainActor
    private func evaluate(_ web: WKWebView, _ script: String) async throws -> Any {
        try await withCheckedThrowingContinuation { continuation in
            web.evaluateJavaScript(script, in: nil, in: SafeEmailHTML.layoutWorld) { result in
                continuation.resume(with: result)
            }
        }
    }

}
