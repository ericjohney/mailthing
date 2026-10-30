import SwiftUI
import UserNotifications

@MainActor
final class MailStore: ObservableObject {
    @Published var threads: [MailThread] = []
    @Published var drafts: [Draft] = []
    @Published var settings: Settings?
    @Published var label = "INBOX"
    @Published var search = ""
    @Published var path: [String] = []
    @Published var error: String?
    @Published var loading = false
    @Published var total = 0
    @Published var server: String
    @Published var notifications = "Not enabled"
    @Published var pushStatus: String?
    private var page = 1
    private var generation = 0
    private var deviceToken: String?
    private var pendingThread: String?
    var api: MailAPI { MailAPI(baseURL: (try? MailAPI.serverURL(server)) ?? Self.defaultURL) }
    static let defaultURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "MailthingServerURL") as? String ?? "https://mailthing.ericj5.com")!
    init() {
        server = UserDefaults.standard.string(forKey: "server") ?? Self.defaultURL.absoluteString
        CodeMailbox.configure(server: api.baseURL)
    }
    var unread: Int { settings?.counts["INBOX"]?.unread ?? 0 }
    var userLabels: [MailLabel] {
        (settings?.labels.filter { $0.kind == "user" } ?? []).sorted {
            if $0.isPinned != $1.isPinned { return $0.isPinned }
            return $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
    }
    func labelChanged(_ value: MailLabel, deleted: Bool = false) {
        settings?.labels.removeAll { $0.id == value.id }
        if !deleted { settings?.labels.append(value) }
        if deleted && label == value.id { select("INBOX") }
    }
    var title: String {
        if !search.isEmpty { return "Search results" }
        return settings?.labels.first { $0.id == label }?.name ?? ["ALL": "All mail", "DRAFTS": "Drafts"][label] ?? "Inbox"
    }
    func refresh() async {
        generation += 1
        let current = generation
        let selectedLabel = label, selectedSearch = search
        loading = true
        defer { if current == generation { loading = false } }
        do {
            async let account: Settings = api.request("settings")
            if selectedLabel == "DRAFTS" && selectedSearch.isEmpty {
                let value: [Draft] = try await api.request("drafts")
                let profile = try await account
                guard current == generation else { return }
                drafts = value; settings = profile; threads = []; total = value.count
            } else {
                let result: ThreadPage = try await api.request("threads", query: query(label: selectedLabel, search: selectedSearch, page: 1))
                let profile = try await account
                guard current == generation else { return }
                threads = result.threads; total = result.total; settings = profile; page = 1
            }
            error = nil
            try? await UNUserNotificationCenter.current().setBadgeCount(unread)
            if let pendingThread { path = [pendingThread]; self.pendingThread = nil }
            try? await CodeAutoFill.sync(server: api.baseURL)
        } catch {
            guard current == generation, !(error is CancellationError), (error as? URLError)?.code != .cancelled else { return }
            self.error = error.localizedDescription
        }
    }
    private func query(label: String, search: String, page: Int) -> [URLQueryItem] {
        var result = [URLQueryItem(name: "label", value: label), URLQueryItem(name: "page", value: String(page))]
        if !search.isEmpty { result.append(URLQueryItem(name: "q", value: search)) }
        return result
    }
    func loadMore() async {
        guard !loading, threads.count < total else { return }
        let current = generation
        loading = true
        defer { if current == generation { loading = false } }
        do {
            let result: ThreadPage = try await api.request("threads", query: query(label: label, search: search, page: page + 1))
            guard current == generation else { return }
            page += 1
            let ids = Set(threads.map(\.id))
            threads += result.threads.filter { !ids.contains($0.id) }
        } catch { if current == generation { self.error = error.localizedDescription } }
    }
    func select(_ label: String) { self.label = label; search = ""; path = [] }
    func action(_ id: String, _ action: String, value: String = "", until: Int64? = nil) async {
        do { try await api.action(id, action, value: value, until: until); await refresh() }
        catch { self.error = error.localizedDescription }
    }
    func connect(_ address: String) async throws {
        let url = try MailAPI.serverURL(address)
        let profile: Settings = try await MailAPI(baseURL: url).request("settings")
        if url != api.baseURL, let deviceToken {
            let _: EmptyReply = try await api.request("push/devices/\(deviceToken)", method: "DELETE")
        }
        server = url.absoluteString; UserDefaults.standard.set(server, forKey: "server")
        CodeMailbox.configure(server: url)
        settings = profile; path = []; select("INBOX")
        await refresh(); await registerPush()
    }
    func enableNotifications() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            await notificationStatus()
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        } catch { self.error = error.localizedDescription }
    }
    func notificationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            notifications = "Enabled"; UIApplication.shared.registerForRemoteNotifications()
        case .denied: notifications = "Disabled in iOS Settings"
        default: notifications = "Not enabled"
        }
    }
    func receivedToken(_ token: String) async { deviceToken = token; await registerPush() }
    func registerPush() async {
        guard let deviceToken else { return }
        do {
            #if DEBUG
            let environment = "sandbox"
            #else
            let environment = "production"
            #endif
            let result: PushRegistration = try await api.request("push/devices", method: "POST", body: JSONSerialization.data(withJSONObject: ["token": deviceToken, "environment": environment]))
            pushStatus = result.configured ? "Ready for new mail" : "Waiting for server push configuration"
        } catch { pushStatus = "Couldn't register: \(error.localizedDescription)" }
    }
    func openNotification(_ thread: String) {
        guard UUID(uuidString: thread) != nil else { return }
        path = [thread]; pendingThread = thread
    }
}
private struct PushRegistration: Decodable { var configured: Bool }
