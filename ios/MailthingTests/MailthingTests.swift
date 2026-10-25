import XCTest
import WebKit
@testable import Mailthing

final class MailthingTests: XCTestCase {
    private let codeNow = Date(timeIntervalSince1970: 1_800_000_000)
    private func codeMail(_ text: String, subject: String = "Sign in", age: Double = 10, sender: String = "security@example.com") -> CodeMail {
        CodeMail(id: "code-message", senderEmail: sender, subject: subject, text: text, receivedAt: codeNow.addingTimeInterval(-age).timeIntervalSince1970 * 1000)
    }

    func testVerificationCodeExtractionSupportsCommonFormatsAndUnicodeText() throws {
        for text in ["Your verification code is 123456", "123456 is your sign-in code", "123456 is your Example verification code", "Hello 👋\nYour one-time password: 123456", "Security code\n123456"] {
            let code = try XCTUnwrap(VerificationCode.extract(from: codeMail(text), now: codeNow), text)
            XCTAssertEqual(code.code, "123456")
            XCTAssertEqual(code.domain, "example.com")
        }
        XCTAssertEqual(VerificationCode.extract(from: codeMail("Your passcode: 0421"), now: codeNow)?.code, "0421")
    }

    func testVerificationCodeExtractionRejectsOrdinaryNumbersQuotesAndAmbiguity() {
        for text in ["Order #123456 has shipped", "Call 415-555-1234", "Your verification code will arrive soon. Your order is 123456", "Your verification code: 123456789", "Your security code is 123456 and your verification code is 234567", "> Your verification code is 123456"] {
            XCTAssertNil(VerificationCode.extract(from: codeMail(text), now: codeNow), text)
        }
        XCTAssertNil(VerificationCode.extract(from: codeMail("Your security code: 123456", subject: "Fwd: Login"), now: codeNow))
        XCTAssertNil(VerificationCode.extract(from: codeMail("Your security code: 123456", sender: "bad-address"), now: codeNow))
    }

    func testVerificationCodesExpireAndRejectFutureReceiptTimes() {
        XCTAssertNil(VerificationCode.extract(from: codeMail("Your security code: 123456", age: 601), now: codeNow))
        XCTAssertNil(VerificationCode.extract(from: codeMail("Your security code: 123456", age: -1), now: codeNow))
        XCTAssertNil(VerificationCode.extract(from: codeMail("Your security code: 123456. Expires in 1 minute", age: 61), now: codeNow))
        XCTAssertNotNil(VerificationCode.extract(from: codeMail("Your security code: 123456. Valid for 30 seconds", age: 10), now: codeNow))
    }

    func testVerificationCodeDomainsDoNotMatchLookalikeServices() throws {
        let code = try XCTUnwrap(VerificationCode.extract(from: codeMail("Your security code: 123456"), now: codeNow))
        XCTAssertTrue(code.matches("https://login.example.com/session"))
        XCTAssertTrue(code.matches("example.com"))
        XCTAssertTrue(code.matches("https://LOGIN.EXAMPLE.COM"))
        XCTAssertFalse(code.matches("example.com.attacker.net"))
        XCTAssertFalse(code.matches("fake-example.com"))
    }

    func testCodeProviderRetainsBoundedDomainMetadataForTheNextCode() throws {
        let code = try XCTUnwrap(VerificationCode.extract(from: codeMail("Your security code is 123456"), now: codeNow))
        let old = codeNow.addingTimeInterval(-31 * 86400).timeIntervalSince1970
        let previous = ["expired.example": old, "future.example": codeNow.addingTimeInterval(60).timeIntervalSince1970, "known.example": codeNow.addingTimeInterval(-86400).timeIntervalSince1970]
        let domains = CodeMailbox.refreshedServices(previous, codes: [code], now: codeNow)
        XCTAssertEqual(Set(domains.keys), ["known.example", "example.com"])
        XCTAssertEqual(CodeMailbox.refreshedServices(domains, codes: [], now: codeNow), domains, "Retain domain identity for a subsequent code while the host is closed")
        let many = Dictionary(uniqueKeysWithValues: (0..<120).map { ("domain\($0).example", codeNow.timeIntervalSince1970) })
        XCTAssertEqual(CodeMailbox.refreshedServices(many, codes: [], now: codeNow).count, 100)
    }

    func testCodeProviderFetchUsesFreshMailSuppressesConsumedCodesAndRejectsServerErrors() async throws {
        let server = URL(string: "http://127.0.0.1:19005")!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CodeProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let previous = CodeMailbox.defaults?.dictionary(forKey: "usedCodes")
        defer { CodeMailbox.defaults?.set(previous, forKey: "usedCodes") }
        CodeMailbox.defaults?.removeObject(forKey: "usedCodes")
        let now = Date()
        func message(_ id: String, age: Double, code: String) -> [String: Any] {
            ["id": id, "sender_email": "security@example.com", "subject": "Your verification code", "text": "Your verification code is \(code)", "received_at": now.addingTimeInterval(-age).timeIntervalSince1970 * 1000]
        }
        CodeProtocol.response = try JSONSerialization.data(withJSONObject: ["messages": [message("latest", age: 1, code: "123456"), message("older", age: 30, code: "234567")]])
        CodeProtocol.status = 200
        let codes = try await CodeMailbox.fetch(server: server, session: session, now: now)
        XCTAssertEqual(codes.map(\.id), ["latest"])
        XCTAssertEqual(CodeProtocol.path, "/api/autofill/messages")
        CodeMailbox.consume(try XCTUnwrap(codes.first), server: server)
        let afterUse = try await CodeMailbox.fetch(server: server, session: session, now: now)
        XCTAssertTrue(afterUse.isEmpty, "An older code must not reappear after filling the latest code")
        CodeProtocol.status = 503
        do { _ = try await CodeMailbox.fetch(server: server, session: session, now: now); XCTFail("Server failure must not return cached codes") }
        catch { XCTAssertTrue(error is CodeMailboxError) }
    }

    func testClearingOneConversationKeepsOtherDeliveredAlerts() {
        let delivered: [(id: String, threadID: String?)] = [("a", "first"), ("b", "other"), ("c", "first"), ("d", nil)]
        XCTAssertEqual(MailNotifications.identifiers(for: "first", in: delivered), ["a", "c"])
        XCTAssertEqual(MailNotifications.identifiers(for: "missing", in: delivered), [])
    }

    func testTagUpdateWireFormatSupportsMultipleTagsAndRemovingAll() throws {
        for tags in [["travel", "receipts"], []] {
            let data = try JSONEncoder.mailthing.encode(TagUpdate(threadIds: ["thread"], labelIds: tags))
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertEqual(json["thread_ids"] as? [String], ["thread"])
            XCTAssertEqual(json["action"] as? String, "set_labels")
            XCTAssertEqual(json["label_ids"] as? [String], tags)
        }
    }

    func testSenderBadgesHandleNamesAddressesAndMissingSenders() {
        XCTAssertEqual(SenderInitials.make(name: "Sam Rivera", email: "sam@example.net"), "SR")
        XCTAssertEqual(SenderInitials.make(name: "  Élise van Dijk  ", email: ""), "ÉD")
        XCTAssertEqual(SenderInitials.make(name: "李 小龍", email: ""), "李小")
        XCTAssertEqual(SenderInitials.make(name: "Studio", email: "hello@example.net"), "S")
        XCTAssertEqual(SenderInitials.make(name: "", email: "no-reply@example.net"), "NR")
        XCTAssertEqual(SenderInitials.make(name: "sam.rivera@example.net", email: "sam.rivera@example.net"), "SR")
        XCTAssertEqual(SenderInitials.make(name: "💌", email: ""), "?")
        XCTAssertEqual(SenderInitials.make(name: "", email: ""), "?")
    }

    @MainActor
    func testUnreadFilterCombinesWithSearchAndResetsOnMailboxChange() {
        let store = MailStore()
        store.search = "from:sam@example.net"
        store.unreadOnly = true
        XCTAssertEqual(store.effectiveSearch, "from:sam@example.net is:unread")
        store.select("Travel")
        XCTAssertEqual(store.effectiveSearch, "")
        XCTAssertFalse(store.unreadOnly)
        XCTAssertEqual(store.label, "Travel")
    }

    func testAttachmentPreviewUsesMIMEAndFallsBackToGenericFileExtensions() {
        for (name, mime) in [("scan", "application/pdf"), ("photo", "image/png"), ("invoice.PDF", "application/octet-stream"), ("photo.JPG", "")] {
            let attachment = Attachment(id: "a", messageId: "m", name: name, contentType: mime, size: 1)
            XCTAssertNotNil(attachment.previewType, name)
            XCTAssertFalse(URL(fileURLWithPath: attachment.downloadName).pathExtension.isEmpty, "Quick Look needs a matching extension")
        }
        for (name, mime) in [("note.txt", "text/plain"), ("message.html", "text/html"), ("fake.pdf", "application/zip")] {
            let attachment = Attachment(id: "a", messageId: "m", name: name, contentType: mime, size: 1)
            XCTAssertNil(attachment.previewType, name)
        }
        let attachment = Attachment(id: "a", messageId: "m", name: "../../private/file.html", contentType: "application/pdf", size: 1)
        XCTAssertEqual(attachment.downloadName, "file.html.pdf")
    }
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
    func testSortingSettingsDecodeAndRemainCompatibleWithOlderServers() throws {
        let base = #"{"account":{"name":"Eric","email":"eric@example.com"},"labels":[],"counts":{},"outbound_configured":false}"#
        let older = try JSONDecoder.mailthing.decode(Settings.self, from: Data(base.utf8))
        XCTAssertNil(older.sortingConfigured)
        let current = String(base.dropLast()) + #","sorting_configured":true,"sorting_model":"gpt-6-luna","spam_threshold":0.95}"#
        let settings = try JSONDecoder.mailthing.decode(Settings.self, from: Data(current.utf8))
        XCTAssertEqual(settings.sortingConfigured, true)
        XCTAssertEqual(settings.sortingModel, "gpt-6-luna")
        XCTAssertEqual(settings.spamThreshold, 0.95)
    }
    func testSortingMemoryDecodesGuidanceAndBothCorrectionKinds() throws {
        let json = #"[{"label_id":"SPAM","name":"Spam","kind":"system","guidance":"Unsolicited scams","example_count":2,"examples":[{"included":true,"sender":"junk@example.com","subject":"A scam","snippet":"Bad mail"},{"included":false,"sender":"shop@example.com","subject":"A newsletter","snippet":"Legitimate mail"}]}]"#
        let memories = try JSONDecoder.mailthing.decode([SortingMemory].self, from: Data(json.utf8))
        let memory = try XCTUnwrap(memories.first)
        XCTAssertEqual(memory.id, "SPAM")
        XCTAssertTrue(memory.isSpam)
        XCTAssertEqual(memory.guidance, "Unsolicited scams")
        XCTAssertEqual(memory.exampleCount, 2)
        XCTAssertTrue(memory.examples[0].included)
        XCTAssertFalse(memory.examples[1].included)
    }
    func testSortingGuidanceAndClearExamplesUseTheServerWireFormat() throws {
        let update = SortingMemoryUpdate(guidance: "Travel receipts", clearExamples: true)
        let data = try JSONEncoder.mailthing.encode(update)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["guidance"] as? String, "Travel receipts")
        XCTAssertEqual(json["clear_examples"] as? Bool, true)
        XCTAssertNil(json["clearExamples"])
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
    func testCcAndBccOnlyDraftsRemainSaveableWhenClosingCompose() throws {
        var ccDraft = Draft()
        ccDraft.cc = "friend@example.net"
        var bccDraft = Draft()
        bccDraft.bcc = "friend@example.net"
        for draft in [ccDraft, bccDraft] {
            let saved = try JSONDecoder.mailthing.decode(Draft.self, from: JSONEncoder.mailthing.encode(draft))
            XCTAssertTrue(saved.hasContent, "Closing compose must offer to save recipient-only edits")
        }
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
        let html = "<style>.offer { color:rgb(255,0,0) }</style><div id='preview-padding' style='display:none'>hidden padding</div><table width='600' style='width:600px'><tr><td><p class='offer'>Product details</p><div style='height:1200px'>Long email</div></td></tr></table><script>window.emailScriptExecuted = true</script>"
        web.loadHTMLString(SafeEmailHTML.document(html), baseURL: nil)
        // Cold hosted simulators need time to launch WebKit's child processes.
        // Keep the same layout assertions, but wait for the first real measure.
        for _ in 0..<450 {
            if coordinator.measuredHeight > 600 && coordinator.measuredHeight < 1000 { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertGreaterThan(coordinator.measuredHeight, 600, "The trusted layout script must run even though email scripts are disabled")
        guard coordinator.measuredHeight > 600 else { return }
        let result = try await evaluate(web, "({width:document.documentElement.scrollWidth * window.visualViewport.scale, viewport:window.visualViewport.width * window.visualViewport.scale, hidden:getComputedStyle(document.getElementById('preview-padding')).display, color:getComputedStyle(document.querySelector('.offer')).color, textAdjust:getComputedStyle(document.getElementById('mailthing-content')).getPropertyValue('-webkit-text-size-adjust'), executed:window.emailScriptExecuted === true})")
        let metrics = try XCTUnwrap(result as? [String: Any], "Unexpected JavaScript result: \(String(describing: result))")
        XCTAssertLessThanOrEqual((metrics["width"] as! NSNumber).doubleValue, (metrics["viewport"] as! NSNumber).doubleValue + 1)
        XCTAssertEqual(metrics["hidden"] as? String, "none")
        XCTAssertEqual(metrics["color"] as? String, "rgb(255, 0, 0)")
        XCTAssertEqual(metrics["executed"] as? Bool, false)
        XCTAssertEqual(metrics["textAdjust"] as? String, "none")
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
        let widthResult = try await evaluate(web, "document.documentElement.scrollWidth * window.visualViewport.scale")
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

private final class CodeProtocol: URLProtocol {
    static var response = Data()
    static var status = 200
    static var path: String?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.path = request.url?.path
        let reply = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: reply, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.response)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
