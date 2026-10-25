import AuthenticationServices
import SwiftUI

@available(iOS 18.0, *)
final class CredentialProviderViewController: ASCredentialProviderViewController {
    private var host: UIViewController?
    private var task: Task<Void, Never>?

    override func prepareOneTimeCodeCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        load(services: serviceIdentifiers.map(\.identifier))
    }

    override func provideCredentialWithoutUserInteraction(for credentialRequest: ASCredentialRequest) {
        guard credentialRequest.type == .oneTimeCode,
              let identity = credentialRequest.credentialIdentity as? ASOneTimeCodeCredentialIdentity,
              let recordID = identity.recordIdentifier else { cancel(.credentialIdentityNotFound); return }
        task?.cancel()
        task = Task { @MainActor in
            do {
                let server = try CodeMailbox.serverURL()
                let codes = try await CodeMailbox.fetch(server: server)
                guard !Task.isCancelled else { return }
                guard recordID == CodeMailbox.identityID(domain: identity.serviceIdentifier.identifier, server: server),
                      let code = codes.first(where: { $0.domain == identity.serviceIdentifier.identifier.lowercased() }) else {
                    cancel(.credentialIdentityNotFound); return
                }
                await fill(code, server: server)
            } catch { cancel(.userInteractionRequired) }
        }
    }

    override func prepareInterfaceToProvideCredential(for credentialRequest: ASCredentialRequest) {
        guard credentialRequest.type == .oneTimeCode,
              let identity = credentialRequest.credentialIdentity as? ASOneTimeCodeCredentialIdentity else {
            cancel(.credentialIdentityNotFound); return
        }
        load(services: [identity.serviceIdentifier.identifier])
    }

    private func load(services: [String]) {
        show(CodeListView(codes: [], loading: true, error: nil, retry: { [weak self] in self?.load(services: services) }, select: { _ in }, cancel: { [weak self] in self?.cancel(.userCanceled) }))
        task?.cancel()
        task = Task { @MainActor in
            do {
                let server = try CodeMailbox.serverURL()
                let codes = try await CodeMailbox.fetch(server: server).filter { code in
                    services.isEmpty || services.contains { code.matches($0) }
                }
                guard !Task.isCancelled else { return }
                show(CodeListView(codes: codes, loading: false, error: nil, retry: { [weak self] in self?.load(services: services) }, select: { [weak self] code in
                    Task { await self?.fill(code, server: server) }
                }, cancel: { [weak self] in self?.cancel(.userCanceled) }))
            } catch {
                guard !Task.isCancelled else { return }
                show(CodeListView(codes: [], loading: false, error: error.localizedDescription, retry: { [weak self] in self?.load(services: services) }, select: { _ in }, cancel: { [weak self] in self?.cancel(.userCanceled) }))
            }
        }
    }

    @MainActor
    private func fill(_ selected: VerificationCode, server: URL) async {
        do {
            // Revalidate after any time spent in the picker, including deletes and spam moves.
            let codes = try await CodeMailbox.fetch(server: server)
            guard (try? CodeMailbox.serverURL()) == server,
                  let code = codes.first(where: { $0.id == selected.id && $0.code == selected.code }), code.expiresAt > Date() else {
                cancel(.credentialIdentityNotFound); return
            }
            CodeMailbox.consume(code, server: server)
            extensionContext.completeOneTimeCodeRequest(using: ASOneTimeCodeCredential(code: code.code), completionHandler: nil)
        } catch { cancel(.failed) }
    }

    private func show(_ view: CodeListView) {
        host?.willMove(toParent: nil); host?.view.removeFromSuperview(); host?.removeFromParent()
        let controller = UIHostingController(rootView: view)
        addChild(controller); controller.view.frame = self.view.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        self.view.addSubview(controller.view); controller.didMove(toParent: self); host = controller
    }

    private func cancel(_ code: ASExtensionError.Code) {
        extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: code.rawValue))
    }
}

private struct CodeListView: View {
    let codes: [VerificationCode]
    let loading: Bool
    let error: String?
    let retry: () -> Void
    let select: (VerificationCode) -> Void
    let cancel: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if loading { ProgressView("Checking recent mail…") }
                else if let error {
                    Text(error).foregroundStyle(.secondary)
                    Button("Try again", action: retry)
                } else if codes.isEmpty {
                    Text("No recent codes for this service. Keep Tailscale connected and request a new code.").foregroundStyle(.secondary)
                    Button("Check again", action: retry)
                } else {
                    ForEach(codes) { code in
                        Button { select(code) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(code.domain).font(.headline)
                                Text(code.code).font(.title2.monospacedDigit())
                                Text("Expires \(code.expiresAt, style: .relative)").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 4)
                        }.foregroundStyle(.primary)
                    }
                    Button("Check again", action: retry)
                }
            }
            .navigationTitle("Mailthing codes").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: cancel) } }
        }.tint(.primary)
    }
}
