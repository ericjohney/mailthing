import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var busy = false
    @State private var error: String?
    @AppStorage("appearance") private var appearance = "system"
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        Image(systemName: "envelope.fill").font(.title2).foregroundStyle(Color.mailBlue).frame(width: 52, height: 52).background(Color.mailTint).clipShape(RoundedRectangle(cornerRadius: 16))
                        VStack(alignment: .leading, spacing: 4) { Text(store.settings?.account.name ?? "Mailthing").font(.headline); Text(store.settings?.account.email ?? "Your personal mailbox").font(.subheadline).foregroundStyle(.secondary) }
                    }.padding(.vertical, 8)
                }
                Section {
                    TextField("Server address", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button { Task { await connect() } } label: { HStack { Text("Connect to server"); Spacer(); if busy { ProgressView() } } }.disabled(busy)
                    if let error { Text(error).foregroundStyle(.red).font(.caption) }
                } header: { Text("Server") } footer: { Text("Keep Tailscale connected to access your private mailbox. Push alerts can arrive even while the app is closed.") }
                Section {
                    LabeledContent("Notifications", value: store.notifications)
                    if let pushStatus = store.pushStatus { Text(pushStatus).font(.caption).foregroundStyle(.secondary) }
                    Button("Enable new mail notifications") { Task { await store.enableNotifications() } }
                    Button("Open iOS notification settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
                } header: { Text("New messages") } footer: { Text("Receive an alert, sound, and unread badge for new inbox messages. Tapping an alert opens its conversation.") }
                Section("Appearance") {
                    Picker("Theme", selection: $appearance) { Text("Device").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark") }
                }
                Section("About") {
                    LabeledContent("Version", value: "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))")
                    LabeledContent("Sending", value: store.settings?.outboundConfigured == true ? "Configured" : "Not configured")
                    Text("Mailbox identity, filters, and labels can be managed in Mailthing on the web.").font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Settings").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
                .onAppear { address = store.server }
        }.preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
    }
    private func connect() async { busy = true; defer { busy = false }; do { try await store.connect(address); error = nil } catch { self.error = error.localizedDescription } }
}
