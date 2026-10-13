import SwiftUI
import UniformTypeIdentifiers

struct ComposeView: View {
    let initial: Draft
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Draft
    @State private var busy = false
    @State private var showCC = false
    @State private var error: String?
    @State private var importFile = false
    @State private var closeConfirmation = false
    @ScaledMetric(relativeTo: .subheadline) private var addressLabelWidth = 38.0
    private var canSend: Bool { !busy && (store.settings?.outboundConfigured ?? false) && !(draft.to.isEmpty && draft.bcc.isEmpty && draft.cc.isEmpty) }
    init(initial: Draft) { self.initial = initial; _draft = State(initialValue: initial); _showCC = State(initialValue: !initial.cc.isEmpty || !initial.bcc.isEmpty) }
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 0) {
                        HStack { Text("From").font(.subheadline).foregroundStyle(.secondary).lineLimit(1).frame(width: addressLabelWidth, alignment: .leading); Text(store.settings?.account.email ?? "").lineLimit(1); Spacer() }.padding(.vertical, 12)
                        Divider()
                        HStack { field("To", value: $draft.to); Button { showCC.toggle() } label: { Text("Cc / Bcc").font(.caption).foregroundStyle(.secondary).frame(minWidth: 44, minHeight: 44) }.accessibilityLabel(showCC ? "Hide Cc and Bcc" : "Show Cc and Bcc") }
                        Divider()
                        if showCC { field("Cc", value: $draft.cc); Divider(); field("Bcc", value: $draft.bcc); Divider() }
                        TextField("Subject", text: $draft.subject, axis: .vertical).padding(.vertical, 12).font(.title3.weight(.semibold)); Divider()
                        TextEditor(text: $draft.body).font(.body).frame(minHeight: 300).scrollContentBackground(.hidden).accessibilityLabel("Message body").padding(.top, 12)
                        ForEach(Array(draft.attachments.enumerated()), id: \.offset) { index, attachment in
                            HStack { Label(attachment.name, systemImage: "paperclip").font(.subheadline).lineLimit(1); Spacer(); Button { draft.attachments.remove(at: index) } label: { Image(systemName: "xmark.circle.fill").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Remove \(attachment.name)") }.padding().background(Color.mailSurface).clipShape(RoundedRectangle(cornerRadius: 12)).padding(.vertical, 4)
                        }
                    }.padding(.horizontal, 20)
                }
                if !((store.settings?.outboundConfigured) ?? false) {
                    Label("Sending isn't configured on your server. You can save a draft.", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary).padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.mailSurface)
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption).padding() }
                if busy { ProgressView().padding() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                MailHeader {
                    MailIconButton(symbol: "xmark", label: "Close message") {
                        if draft.hasContent { closeConfirmation = true } else { dismiss() }
                    }.disabled(busy)
                    Text("New message").font(.headline).lineLimit(1)
                    Spacer(minLength: 0)
                    MailIconButton(symbol: "paperclip", label: "Attach file") { importFile = true }.disabled(busy)
                    Button { Task { await send() } } label: {
                        Text("Send").font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .foregroundStyle(Color.mailOnAction)
                            .background(Color.mailAction, in: RoundedRectangle(cornerRadius: 9))
                            .frame(minHeight: 44)
                    }.buttonStyle(.plain).accessibilityLabel("Send message")
                        .disabled(!canSend).opacity(canSend ? 1 : 0.45)
                }
            }
            .confirmationDialog("Close this message?", isPresented: $closeConfirmation, titleVisibility: .visible) {
                Button("Save draft & close") { Task { await save() } }
                Button("Discard draft", role: .destructive) { Task { await remove() } }
                Button("Keep editing", role: .cancel) {}
            }
            .interactiveDismissDisabled(draft.hasContent)
            .fileImporter(isPresented: $importFile, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                do {
                    for url in try result.get() {
                        let accessed = url.startAccessingSecurityScopedResource(); defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
                        let existing = draft.attachments.reduce(0) { $0 + $1.data.count }
                        guard (attributes[.size] as? Int ?? 0) <= 18 * 1024 * 1024, existing <= 24 * 1024 * 1024 else { throw APIError(message: "Attachments are too large. Choose a smaller file.") }
                        let data = try Data(contentsOf: url)
                        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                        draft.attachments.append(DraftAttachment(name: url.lastPathComponent, contentType: type, data: data.base64EncodedString()))
                    }
                } catch { self.error = error.localizedDescription }
            }
        }.tint(.mailAction)
    }
    private func field(_ name: String, value: Binding<String>) -> some View {
        HStack { Text(name).font(.subheadline).foregroundStyle(.secondary).lineLimit(1).frame(width: addressLabelWidth, alignment: .leading); TextField(name, text: value).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }.padding(.vertical, 12)
    }
    private func save() async {
        busy = true; defer { busy = false }
        do { if draft.hasContent { draft.updatedAt = Int64(Date().timeIntervalSince1970 * 1000); try await store.api.save(draft) }; dismiss() }
        catch { self.error = error.localizedDescription }
    }
    private func send() async {
        busy = true; defer { busy = false }
        do { try await store.api.save(draft); let _: EmptyReply = try await store.api.request("drafts/\(draft.id)/send", method: "POST"); dismiss() }
        catch { self.error = error.localizedDescription }
    }
    private func remove() async {
        busy = true; defer { busy = false }
        do { let _: EmptyReply = try await store.api.request("drafts/\(draft.id)", method: "DELETE"); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}
