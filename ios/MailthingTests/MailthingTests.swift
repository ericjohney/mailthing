import XCTest
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
    }
}
