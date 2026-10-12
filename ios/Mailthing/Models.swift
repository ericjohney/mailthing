import Foundation

struct Account: Codable { var name: String; var email: String }
struct MailLabel: Codable, Identifiable { var id: String; var name: String; var color: String; var kind: String }
struct MailCount: Codable { var total: Int; var unread: Int }
struct Settings: Codable {
    var account: Account
    var labels: [MailLabel]
    var counts: [String: MailCount]
    var outboundConfigured: Bool
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
}
struct Conversation: Codable { var messages: [MailMessage]; var attachments: [Attachment]; var labels: [MailLabel] }
struct DraftAttachment: Codable { var name: String; var contentType: String; var data: String }
struct Draft: Codable, Identifiable {
    var id = UUID().uuidString
    var to = ""; var cc = ""; var bcc = ""; var subject = ""; var body = ""; var inReplyTo = ""
    var attachments: [DraftAttachment] = []
    var updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
    var hasContent: Bool { !to.isEmpty || !subject.isEmpty || !body.isEmpty || !attachments.isEmpty }
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
