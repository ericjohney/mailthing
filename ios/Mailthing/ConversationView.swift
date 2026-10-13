import SwiftUI
import WebKit

struct ConversationView: View {
    let id: String
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    @State private var conversation: Conversation?
    @State private var error: String?
    @State private var compose: Draft?
    @State private var share: SharedFile?
    @State private var downloading = false
    private var isSpam: Bool { conversation?.messages.contains { $0.labels.contains("SPAM") } == true }
    private var latestMessage: MailMessage? { conversation?.messages.last }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let conversation {
                    Text(conversation.messages.first?.subject.isEmpty == false ? conversation.messages.first!.subject : "(no subject)")
                        .font(.title3.weight(.semibold)).padding(.top, 12)
                    let labels = conversation.labels.filter { $0.id == "IMPORTANT" || $0.kind == "user" }
                    if !labels.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(labels) { label in
                                    Text(label.name).font(.caption).padding(.horizontal, 8).padding(.vertical, 4)
                                        .background(Color.mailSurface, in: RoundedRectangle(cornerRadius: 5))
                                }
                            }
                        }
                    }
                    ForEach(conversation.messages) { message in
                        VStack(alignment: .leading, spacing: 14) {
                            if conversation.messages.count > 1 { messageHeading(message) }
                            if message.html.isEmpty {
                                Text(message.text).font(.body).lineSpacing(4).textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else { EmailBody(html: message.html) }
                            ForEach(conversation.attachments.filter { $0.messageId == message.id }) { attachment in
                                Button { Task { await download(attachment) } } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "doc").font(.title3)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(attachment.name).font(.subheadline).lineLimit(2)
                                            Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.size), countStyle: .file)).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Image(systemName: "arrow.down.to.line")
                                    }.foregroundStyle(.primary).padding(14)
                                        .background(Color.mailSurface, in: RoundedRectangle(cornerRadius: 10))
                                }.disabled(downloading)
                            }
                            if conversation.messages.count > 1 {
                                HStack {
                                    Button { compose = Draft.reply(to: message) } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
                                    replyMenu(message)
                                }.buttonStyle(.bordered).padding(.top, 4)
                            }
                        }
                        if conversation.messages.count > 1 { Divider() }
                    }
                } else if error == nil { ProgressView().frame(maxWidth: .infinity).padding(60) }
                if let error {
                    ContentUnavailableView("Couldn't load message", systemImage: "exclamationmark.circle", description: Text(error))
                    Button("Retry") { Task { await load() } }
                }
            }.padding(.horizontal, 20).padding(.bottom, 24)
        }
        .background(Color(uiColor: .systemBackground))
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .task(id: id) { await load() }
        .refreshable { await load() }
        .sheet(item: $compose) { ComposeView(initial: $0) }
        .sheet(item: $share) { ShareSheet(url: $0.url) }
        .tint(.mailAction)
    }

    private var header: some View {
        MailHeader {
            MailIconButton(symbol: "chevron.left", label: "Back to inbox") { dismiss() }
            if let message = latestMessage {
                Menu {
                    Text(message.senderEmail)
                    Text("To: \(message.recipients)")
                    if !message.cc.isEmpty { Text("Cc: \(message.cc)") }
                    Text(Date(timeIntervalSince1970: message.receivedAt / 1000), format: .dateTime.month(.abbreviated).day().hour().minute())
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(message.sender.isEmpty ? message.senderEmail : message.sender).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Text("to \(message.recipients)").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }.foregroundStyle(.primary).accessibilityLabel("Message details for \(message.sender.isEmpty ? message.senderEmail : message.sender)")
            } else { Spacer() }
            MailIconButton(symbol: "archivebox", label: "Archive conversation") { Task { await move("archive") } }
                .disabled(conversation == nil)
            MailIconButton(symbol: "arrowshape.turn.up.left", label: "Reply") {
                if let message = latestMessage { compose = Draft.reply(to: message) }
            }.disabled(latestMessage == nil)
            Menu {
                Button("Move to Trash", systemImage: "trash", role: .destructive) { Task { await move("trash") } }
                if let message = latestMessage {
                    Button("Reply all", systemImage: "arrowshape.turn.up.left.2") { compose = Draft.reply(to: message, all: true, accountEmail: store.settings?.account.email ?? "") }
                    Button("Forward", systemImage: "arrowshape.turn.up.right") { forward(message) }
                }
                Button("Mark unread", systemImage: "envelope.badge") { Task { await move("unread") } }
                let starred = conversation?.messages.contains { $0.labels.contains("STARRED") } == true
                Button(starred ? "Unstar" : "Star", systemImage: starred ? "star.slash" : "star") {
                    Task { await store.action(id, starred ? "unstar" : "star"); await load() }
                }
                Button("Move to Inbox", systemImage: "tray") { Task { await move("inbox") } }
                Button(isSpam ? "Not spam" : "Report spam", systemImage: isSpam ? "checkmark.shield" : "exclamationmark.octagon") { Task { await move(isSpam ? "not_spam" : "spam") } }
                Button("Snooze until tomorrow", systemImage: "clock") {
                    Task { await store.action(id, "snooze", until: Int64(Date().addingTimeInterval(86400).timeIntervalSince1970 * 1000)); if store.error == nil { dismiss() } }
                }
                if let labels = store.settings?.labels.filter({ $0.kind == "user" }) {
                    ForEach(labels) { label in
                        let applied = conversation?.labels.contains { $0.id == label.id } ?? false
                        Button("\(applied ? "Remove" : "Add") \(label.name)") {
                            Task { await store.action(id, applied ? "unlabel" : "label", value: label.id); await load() }
                        }
                    }
                }
            } label: {
                Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }.foregroundStyle(Color.mailAction).accessibilityLabel("More conversation actions").disabled(conversation == nil)
        }
    }

    private func messageHeading(_ message: MailMessage) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(message.sender.isEmpty ? message.senderEmail : message.sender).font(.subheadline.weight(.semibold))
                Spacer()
                Text(Date(timeIntervalSince1970: message.receivedAt / 1000), format: .dateTime.month(.abbreviated).day()).font(.caption2).foregroundStyle(.secondary)
            }
            Text(message.senderEmail).font(.caption).foregroundStyle(.secondary)
            Text("to \(message.recipients)").font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
    }

    private func replyMenu(_ message: MailMessage) -> some View {
        Menu {
            Button("Reply all") { compose = Draft.reply(to: message, all: true, accountEmail: store.settings?.account.email ?? "") }
            Button("Forward") { forward(message) }
        } label: { Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Reply all or forward")
    }

    private func forward(_ message: MailMessage) {
        var draft = Draft()
        draft.subject = "Fwd: \(message.subject)"
        draft.body = "\n\n---------- Forwarded message ----------\nFrom: \(message.sender) <\(message.senderEmail)>\nSubject: \(message.subject)\n\n\(message.text)"
        compose = draft
    }
    private func load() async {
        do {
            conversation = try await store.api.request("threads/\(id)")
            try await store.api.action(id, "read")
            error = nil; await store.refresh()
        } catch { self.error = error.localizedDescription }
    }
    private func move(_ action: String) async { await store.action(id, action); if store.error == nil { dismiss() } else { error = store.error } }
    private func download(_ attachment: Attachment) async {
        downloading = true; defer { downloading = false }
        do {
            let data = try await store.api.data("attachments/\(attachment.id)")
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let url = folder.appendingPathComponent(URL(fileURLWithPath: attachment.name).lastPathComponent)
            try data.write(to: url, options: .atomic); share = SharedFile(url: url)
        } catch { self.error = error.localizedDescription }
    }
}
struct SharedFile: Identifiable { let id = UUID(); var url: URL }
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct EmailBody: View {
    let html: String
    @State private var showImages = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if html.range(of: "<img\\b|url\\s*\\(", options: .regularExpression) != nil {
                HStack {
                    Text(showImages ? "Remote images are shown." : "Remote images are hidden.").foregroundStyle(.secondary)
                    Button(showImages ? "Hide images" : "Show images") { showImages.toggle() }
                }.font(.caption)
            }
            SafeEmailHTML(html: html, showImages: showImages)
        }
    }
}

struct SafeEmailHTML: UIViewRepresentable {
    let html: String
    var showImages = false
    @State private var height: CGFloat = 200
    static let layoutWorld = WKContentWorld.world(name: "MailthingLayout")
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView { makeWebView(coordinator: context.coordinator) }
    func makeWebView(coordinator: Coordinator) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        // Only app-owned layout code executes, in a separate JavaScript world.
        configuration.userContentController.addUserScript(WKUserScript(source: Self.layoutScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: Self.layoutWorld))
        configuration.userContentController.add(coordinator, contentWorld: Self.layoutWorld, name: "mailthingSize")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = coordinator
        web.scrollView.isScrollEnabled = false
        web.isOpaque = false; web.backgroundColor = .clear
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.parent = self
        let document = Self.document(html, showImages: showImages)
        guard context.coordinator.document != document else { return }
        context.coordinator.document = document
        web.loadHTMLString(document, baseURL: nil)
    }
    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "mailthingSize", contentWorld: layoutWorld)
        web.stopLoading(); web.navigationDelegate = nil
    }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: WKWebView, context: Context) -> CGSize? { CGSize(width: proposal.width ?? 320, height: height) }
    static func document(_ html: String, showImages: Bool = false) -> String {
        let images = showImages ? "https: http: data:" : "data:"
        return """
        <!doctype html><html><head><meta id="mailthing-viewport" name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src \(images); base-uri 'none'; form-action 'none'"><style>:root{color-scheme:light}body{color:#202124;background:#fff;font:16px -apple-system,sans-serif;margin:0;overflow-wrap:anywhere}img{max-width:100%}pre{white-space:pre-wrap}a{color:#346dd6}</style></head><body><div id="mailthing-content">\(html)</div></body></html>
        """
    }
    static let layoutScript = """
    (() => {
      const root = document.getElementById('mailthing-content');
      if (!root) return;
      let pending = false, lastHeight = 0, lastWidth = 0;
      const measure = () => {
        pending = false;
        const viewport = window.visualViewport;
        const width = Math.round(viewport ? viewport.width * viewport.scale : window.innerWidth);
        if (!width) return;
        root.style.display = 'flow-root';
        root.style.setProperty('-webkit-text-size-adjust', 'none', 'important');
        root.style.width = width + 'px';
        const natural = Math.max(width, root.scrollWidth);
        root.style.width = natural + 'px';
        const meta = document.getElementById('mailthing-viewport');
        const policy = 'width=' + natural + ',initial-scale=' + (width / natural);
        if (meta.content !== policy) meta.content = policy;
        const scale = window.visualViewport?.scale || 1;
        const height = Math.ceil(root.getBoundingClientRect().height * scale) + 1;
        if (height !== lastHeight) {
          lastHeight = height;
          window.webkit.messageHandlers.mailthingSize.postMessage(height);
        }
      };
      const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(measure); } };
      new ResizeObserver(schedule).observe(root);
      new ResizeObserver(() => {
        const width = document.documentElement.clientWidth;
        if (width !== lastWidth) { lastWidth = width; schedule(); }
      }).observe(document.documentElement);
      window.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('resize', schedule);
      document.addEventListener('load', schedule, true);
      document.addEventListener('error', schedule, true);
      schedule();
    })();
    """
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: SafeEmailHTML; var document: String?
        private(set) var measuredHeight: CGFloat = 0
        init(_ parent: SafeEmailHTML) { self.parent = parent }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let value = message.body as? NSNumber else { return }
            let height = CGFloat(value.doubleValue)
            guard height.isFinite, height > 0, height != measuredHeight else { return }
            measuredHeight = height
            DispatchQueue.main.async { self.parent.height = min(100_000, max(100, height)) }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated {
                if let url = navigationAction.request.url, ["https", "http", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
                decisionHandler(.cancel)
            } else { decisionHandler(navigationAction.request.url?.scheme == "about" ? .allow : .cancel) }
        }
    }
}
