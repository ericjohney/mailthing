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
    @State private var discard = false
    init(initial: Draft) { self.initial = initial; _draft = State(initialValue: initial); _showCC = State(initialValue: !initial.cc.isEmpty || !initial.bcc.isEmpty) }
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 0) {
                        HStack { Text("From").foregroundStyle(.secondary).frame(width: 55, alignment: .leading); Text(store.settings?.account.email ?? "").lineLimit(1); Spacer() }.padding(.vertical, 15)
                        Divider()
                        HStack { field("To", value: $draft.to); Button { showCC.toggle() } label: { Image(systemName: showCC ? "chevron.up" : "chevron.down") }.accessibilityLabel("Show Cc and Bcc") }
                        Divider()
                        if showCC { field("Cc", value: $draft.cc); Divider(); field("Bcc", value: $draft.bcc); Divider() }
                        TextField("Subject", text: $draft.subject).padding(.vertical, 15).font(.system(size: 17)); Divider()
                        TextEditor(text: $draft.body).font(.system(size: 17)).frame(minHeight: 300).scrollContentBackground(.hidden).accessibilityLabel("Message body").padding(.top, 12)
                        ForEach(Array(draft.attachments.enumerated()), id: \.offset) { index, attachment in
                            HStack { Label(attachment.name, systemImage: "paperclip").font(.subheadline).lineLimit(1); Spacer(); Button { draft.attachments.remove(at: index) } label: { Image(systemName: "xmark.circle.fill") }.accessibilityLabel("Remove \(attachment.name)") }.padding().background(Color.mailSurface).clipShape(RoundedRectangle(cornerRadius: 12)).padding(.vertical, 4)
                        }
                    }.padding(.horizontal, 20)
                }
                if !((store.settings?.outboundConfigured) ?? false) {
                    Label("Sending isn't configured on your server. You can save a draft.", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary).padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.mailSurface)
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption).padding() }
                if busy { ProgressView().padding() }
            }
            .navigationTitle("Compose").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Save & close") { Task { await save() } }.disabled(busy) }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { importFile = true } label: { Image(systemName: "paperclip") }.disabled(busy).accessibilityLabel("Attach file")
                    Menu { Button("Discard draft", role: .destructive) { discard = true } } label: { Image(systemName: "ellipsis") }.disabled(busy)
                    Button { Task { await send() } } label: { Image(systemName: "paperplane.fill") }.accessibilityLabel("Send message").disabled(busy || !(store.settings?.outboundConfigured ?? false) || (draft.to.isEmpty && draft.bcc.isEmpty && draft.cc.isEmpty))
                }
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
            .confirmationDialog("Discard this draft?", isPresented: $discard, titleVisibility: .visible) { Button("Discard", role: .destructive) { Task { await remove() } } }
        }
    }
    private func field(_ name: String, value: Binding<String>) -> some View {
        HStack { Text(name).foregroundStyle(.secondary).frame(width: 55, alignment: .leading); TextField(name, text: value).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }.padding(.vertical, 15)
    }
    private func save() async {
        busy = true; defer { busy = false }
        do { if draft.hasContent { draft.updatedAt = Date().timeIntervalSince1970 * 1000; try await store.api.save(draft) }; dismiss() }
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
