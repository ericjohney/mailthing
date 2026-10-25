import Foundation
import UniformTypeIdentifiers

struct Account: Codable { var name: String; var email: String }
struct MailLabel: Codable, Identifiable { var id: String; var name: String; var color: String; var kind: String }
struct MailCount: Codable { var total: Int; var unread: Int }
struct Settings: Codable {
    var account: Account
    var labels: [MailLabel]
    var counts: [String: MailCount]
    var outboundConfigured: Bool
    var sortingConfigured: Bool?
    var sortingModel: String?
    var spamThreshold: Double?
}
struct SortingMemory: Codable, Identifiable {
    var labelId: String
    var name: String
    var kind: String
    var guidance: String
    var exampleCount: Int
    var examples: [SortingExample]
    var id: String { labelId }
    var isSpam: Bool { labelId == "SPAM" }
}
struct SortingExample: Codable {
    var included: Bool
    var sender: String
    var subject: String
    var snippet: String
}
struct SortingMemoryUpdate: Encodable {
    var guidance: String
    var clearExamples = false
}

struct MailThread: Codable, Identifiable, Hashable {
    var id: String; var subject: String; var sender: String; var senderEmail: String
    var snippet: String; var receivedAt: Double; var count: Int; var unread: Int
    var hasAttachment: Bool; var labelIds: [String]
    var starred: Bool { labelIds.contains("STARRED") }
    var date: Date { Date(timeIntervalSince1970: receivedAt / 1000) }
}
struct ThreadPage: Codable { var threads: [MailThread]; var total: Int }
struct MailMessage: Codable, Identifiable {
    var id: String; var threadId: String; var messageId: String
    var subject: String; var sender: String; var senderEmail: String
    var recipients: String; var cc: String; var text: String; var html: String
    var receivedAt: Double; var labels: [String]
}
struct Attachment: Codable, Identifiable {
    var id: String; var messageId: String; var name: String; var contentType: String; var size: Int
    var previewType: UTType? {
        let mime = contentType.split(separator: ";").first.map(String.init)?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
        let type = mime.isEmpty || mime == "application/octet-stream"
            ? UTType(filenameExtension: URL(fileURLWithPath: name).pathExtension)
            : UTType(mimeType: mime)
        guard let type, type.conforms(to: .pdf) || type.conforms(to: .image) else { return nil }
        return type
    }
    var downloadName: String {
        var filename = URL(fileURLWithPath: name).lastPathComponent
        if filename.isEmpty || filename == "." || filename == "/" { filename = "attachment" }
        if let type = previewType,
           UTType(filenameExtension: URL(fileURLWithPath: filename).pathExtension)?.conforms(to: type) != true,
           let suffix = type.preferredFilenameExtension { filename += ".\(suffix)" }
        return filename
    }
}
struct Conversation: Codable { var messages: [MailMessage]; var attachments: [Attachment]; var labels: [MailLabel] }
struct DraftAttachment: Codable { var name: String; var contentType: String; var data: String }
struct Draft: Codable, Identifiable {
    var id = UUID().uuidString
    var to = ""; var cc = ""; var bcc = ""; var subject = ""; var body = ""; var inReplyTo = ""
    var attachments: [DraftAttachment] = []
    var updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
    var hasContent: Bool { !to.isEmpty || !cc.isEmpty || !bcc.isEmpty || !subject.isEmpty || !body.isEmpty || !attachments.isEmpty }
    static func reply(to message: MailMessage, all: Bool = false, accountEmail: String = "") -> Draft {
        var draft = Draft()
        draft.to = message.senderEmail
        if all {
            // API recipient fields contain comma-separated RFC mailbox addresses.
            let addresses = (message.recipients + "," + message.cc).split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
            draft.cc = addresses.filter { !$0.isEmpty && !$0.localizedCaseInsensitiveContains(accountEmail) && !$0.localizedCaseInsensitiveContains(message.senderEmail) }.joined(separator: ", ")
        }
        draft.subject = message.subject.lowercased().hasPrefix("re:") ? message.subject : "Re: \(message.subject)"
        draft.inReplyTo = message.messageId
        draft.body = "\n\nOn \(Date(timeIntervalSince1970: message.receivedAt / 1000).formatted()), \(message.sender) wrote:\n" + message.text.split(separator: "\n", omittingEmptySubsequences: false).map { "> \($0)" }.joined(separator: "\n")
        return draft
    }
}

extension JSONDecoder {
    static var mailthing: JSONDecoder { let value = JSONDecoder(); value.keyDecodingStrategy = .convertFromSnakeCase; return value }
}
extension JSONEncoder {
    static var mailthing: JSONEncoder { let value = JSONEncoder(); value.keyEncodingStrategy = .convertToSnakeCase; return value }
}

/// Stable, local initials. Sender badges never fetch third-party profile images.
enum SenderInitials {
    static func make(name: String, email: String) -> String {
        let display = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let source = display.isEmpty || display.contains("@")
            ? String(email.split(separator: "@").first ?? "") : display
        let words = source.split { $0.isWhitespace || $0 == "." || $0 == "-" || $0 == "_" }
            .map { $0.filter { $0.isLetter || $0.isNumber } }.filter { !$0.isEmpty }
        guard let first = words.first?.first else { return "?" }
        let last = words.count > 1 ? words.last?.first : nil
        return (String(first) + (last.map(String.init) ?? "")).uppercased()
    }
}
