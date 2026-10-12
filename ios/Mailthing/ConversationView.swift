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
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let conversation {
                    Text(conversation.messages.first?.subject.isEmpty == false ? conversation.messages.first!.subject : "(no subject)").font(.system(size: 26, weight: .regular)).padding(.top, 12)
                    HStack {
                        ForEach(conversation.labels.filter { ["INBOX", "IMPORTANT"].contains($0.id) || $0.kind == "user" }) { label in
                            Text(label.name).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).background(Color.mailSurface).clipShape(Capsule())
                        }
                    }
                    ForEach(conversation.messages) { message in
                        VStack(alignment: .leading, spacing: 16) {
                            HStack(alignment: .top, spacing: 12) {
                                Text(String(message.sender.prefix(1))).font(.title3).foregroundStyle(.white).frame(width: 40, height: 40).background(Color.mailBlue).clipShape(Circle())
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(message.sender.isEmpty ? message.senderEmail : message.sender).font(.subheadline.bold())
                                    Text(message.senderEmail).font(.caption).foregroundStyle(.secondary)
                                    Text("to \(message.recipients)").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                }
                                Spacer(minLength: 0)
                                Text(Date(timeIntervalSince1970: message.receivedAt / 1000), format: .dateTime.month(.abbreviated).day()).font(.caption2).foregroundStyle(.secondary)
                            }
                            if message.html.isEmpty { Text(message.text).font(.system(size: 16)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                            else { EmailBody(html: message.html) }
                            ForEach(conversation.attachments.filter { $0.messageId == message.id }) { attachment in
                                Button { Task { await download(attachment) } } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "doc").font(.title2)
                                        VStack(alignment: .leading, spacing: 3) { Text(attachment.name).font(.subheadline); Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.size), countStyle: .file)).font(.caption).foregroundStyle(.secondary) }
                                        Spacer(); Image(systemName: "square.and.arrow.down")
                                    }.padding(14).background(Color.mailSurface).clipShape(RoundedRectangle(cornerRadius: 12))
                                }.disabled(downloading)
                            }
                            HStack {
                                Button { compose = Draft.reply(to: message) } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
                                Menu {
                                    Button("Reply all") { compose = Draft.reply(to: message, all: true, accountEmail: store.settings?.account.email ?? "") }
                                    Button("Forward") { var draft = Draft(); draft.subject = "Fwd: \(message.subject)"; draft.body = "\n\n---------- Forwarded message ----------\nFrom: \(message.sender) <\(message.senderEmail)>\nSubject: \(message.subject)\n\n\(message.text)"; compose = draft }
                                } label: { Image(systemName: "ellipsis").frame(width: 44, height: 36) }.accessibilityLabel("Reply all or forward")
                            }.buttonStyle(.bordered).padding(.top, 8)
                        }
                        Divider()
                    }
                } else if error == nil { ProgressView().frame(maxWidth: .infinity).padding(60) }
                if let error { ContentUnavailableView("Couldn't load message", systemImage: "exclamationmark.circle", description: Text(error)); Button("Retry") { Task { await load() } } }
            }.padding(.horizontal, 20).padding(.bottom, 24)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { Task { await move("archive") } } label: { Image(systemName: "archivebox") }.accessibilityLabel("Archive conversation")
                Button { Task { await move("trash") } } label: { Image(systemName: "trash") }.accessibilityLabel("Move conversation to Trash")
                Menu {
                    Button("Mark unread", systemImage: "envelope.badge") { Task { await move("unread") } }
                    Button("Move to Inbox", systemImage: "tray") { Task { await move("inbox") } }
                    Button("Report spam", systemImage: "exclamationmark.octagon") { Task { await move("spam") } }
                    Button("Snooze until tomorrow", systemImage: "clock") { Task { await store.action(id, "snooze", until: Int64(Date().addingTimeInterval(86400).timeIntervalSince1970 * 1000)); if store.error == nil { dismiss() } } }
                    if let labels = store.settings?.labels.filter({ $0.kind == "user" }) {
                        ForEach(labels) { label in
                            let applied = conversation?.labels.contains { $0.id == label.id } ?? false
                            Button("\(applied ? "Remove" : "Add") \(label.name)") { Task { await store.action(id, applied ? "unlabel" : "label", value: label.id); await load() } }
                        }
                    }
                } label: { Image(systemName: "ellipsis") }.accessibilityLabel("More conversation actions")
            }
        }
        .task(id: id) { await load() }
        .refreshable { await load() }
        .sheet(item: $compose) { ComposeView(initial: $0) }
        .sheet(item: $share) { ShareSheet(url: $0.url) }
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
