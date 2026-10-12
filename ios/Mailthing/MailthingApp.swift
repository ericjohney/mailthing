import SwiftUI
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var store: MailStore?
    private var token: String?
    private var thread: String?
    func attach(_ store: MailStore) {
        self.store = store
        if let token { Task { await store.receivedToken(token) } }
        if let thread { store.openNotification(thread); self.thread = nil }
    }
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        self.token = token
        Task { await store?.receivedToken(token) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in store?.pushStatus = "Push registration failed: \(error.localizedDescription)" }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        Task { await store?.refresh() }
        completion([.banner, .sound, .badge])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completion: @escaping () -> Void) {
        if let thread = response.notification.request.content.userInfo["thread_id"] as? String {
            Task { @MainActor in
                self.thread = thread
                self.store?.openNotification(thread)
            }
        }
        completion()
    }
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completion: @escaping (UIBackgroundFetchResult) -> Void) {
        Task { await store?.refresh(); completion(.newData) }
    }
}

@main
struct MailthingApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var store = MailStore()
    @AppStorage("appearance") private var appearance = "system"
    var body: some Scene {
        WindowGroup {
            InboxView().environmentObject(store)
                .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
                .task { delegate.attach(store); await store.notificationStatus() }
                .onOpenURL { url in
                    if url.scheme == "mailthing", url.host == "thread" { store.openNotification(url.lastPathComponent) }
                }
        }
    }
}
