import UserNotifications

enum MailNotifications {
    static func identifiers(for threadID: String, in delivered: [(id: String, threadID: String?)]) -> [String] {
        delivered.filter { $0.threadID == threadID }.map(\.id)
    }

    static func clear(threadID: String) async {
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications()
        let ids = identifiers(for: threadID, in: delivered.map {
            ($0.request.identifier, $0.request.content.userInfo["thread_id"] as? String)
        })
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }
}
