import AuthenticationServices
import SwiftUI

@MainActor
enum CodeAutoFill {
    static func sync(server: URL) async throws {
        guard #available(iOS 18.0, *) else { return }
        guard await ASCredentialIdentityStore.shared.state().isEnabled else { return }
        let codes = try await CodeMailbox.fetch(server: server)
        guard (try? CodeMailbox.serverURL()) == server else { return }
        let domains = CodeMailbox.updateServices(with: codes)
        let identities: [ASCredentialIdentity] = domains.map {
            ASOneTimeCodeCredentialIdentity(
                serviceIdentifier: ASCredentialServiceIdentifier(identifier: $0, type: .domain),
                label: "Mailthing · \($0)", recordIdentifier: CodeMailbox.identityID(domain: $0, server: server))
        }
        try await ASCredentialIdentityStore.shared.replaceCredentialIdentities(identities)
    }
}

struct CodeAutoFillSettingsView: View {
    @EnvironmentObject private var store: MailStore
    @State private var enabled = false
    @State private var busy = false
    @State private var status: String?
    @State private var error: String?
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Form {
            if #available(iOS 18.0, *) {
                Section {
                    LabeledContent("Mailthing AutoFill", value: enabled ? "Enabled" : "Not enabled")
                    Button("Enable Mailthing AutoFill") {
                        busy = true
                        ASSettingsHelper.requestToTurnOnCredentialProviderExtension { _ in
                            Task { @MainActor in
                                await refresh(); busy = false
                                if !enabled { status = "Mailthing is still off. Open AutoFill settings to enable it." }
                            }
                        }
                    }.disabled(busy || enabled)
                    Button("Open AutoFill settings") {
                        Task {
                            do { try await ASSettingsHelper.openCredentialProviderAppSettings() }
                            catch { self.error = error.localizedDescription }
                        }
                    }
                    Button("Refresh available codes") { Task { await refresh() } }.disabled(busy || !enabled)
                    if let status { Text(status).font(.caption).foregroundStyle(.secondary) }
                    if let error { Text(error).font(.caption).foregroundStyle(.red) }
                } footer: {
                    Text("Enable Mailthing in iOS Settings → General → AutoFill & Passwords. When a website or app asks for a verification code, choose Mailthing from AutoFill.")
                }
                Section {
                    Text("Codes come from recent emails in your mailbox. Keep Tailscale connected. The provider checks for fresh codes when you open it, even if Mailthing is closed.")
                    Text("Codes expire after at most 10 minutes and disappear after filling. Spam, trash, sent mail, imported mail, and forwarded messages are excluded. Some email formats may not be recognized.")
                }.font(.footnote).foregroundStyle(.secondary)
            } else {
                Section { Text("Email verification-code AutoFill requires iOS 18 or later.") }
            }
        }
        .navigationTitle("Verification codes").navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .task(id: phase) { if phase == .active { await refresh() } }
    }

    @MainActor
    private func refresh() async {
        guard #available(iOS 18.0, *) else { return }
        enabled = await ASCredentialIdentityStore.shared.state().isEnabled
        error = nil
        guard enabled else { status = nil; return }
        do {
            try await CodeAutoFill.sync(server: store.api.baseURL)
            status = "Available codes refreshed. iOS controls when suggestions appear."
        } catch { self.error = error.localizedDescription }
    }
}
