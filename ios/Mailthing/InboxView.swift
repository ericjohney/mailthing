import SwiftUI

struct InboxView: View {
    @EnvironmentObject private var store: MailStore
    @State private var sidebar = false
    @State private var showSettings = false
    @State private var settingsAfterSidebar = false
    @State private var compose: Draft?
    @State private var showSearch = false
    @FocusState private var searching: Bool

    private let categories = [("CATEGORY_PERSONAL", "Primary", "tray"), ("CATEGORY_UPDATES", "Updates", "info.circle"), ("CATEGORY_SOCIAL", "Social", "person.2"), ("CATEGORY_PROMOTIONS", "Promotions", "tag")]
    private let mailboxes = [("INBOX", "Inbox", "tray"), ("UNREAD", "Unread", "envelope.badge"), ("STARRED", "Starred", "star"), ("SNOOZED", "Snoozed", "clock"), ("IMPORTANT", "Important", "chevron.right.2"), ("SENT", "Sent", "paperplane"), ("DRAFTS", "Drafts", "doc"), ("ALL", "All mail", "envelope"), ("SPAM", "Spam", "exclamationmark.octagon"), ("TRASH", "Trash", "trash")]

    var body: some View {
        NavigationStack(path: $store.path) {
            VStack(spacing: 0) {
                header
                if showSearch || !store.search.isEmpty { searchBar }
                if let error = store.error { connectionError(error) }
                if store.label == "DRAFTS" && store.search.isEmpty {
                    draftList
                } else {
                    threadList
                }
            }
            .background(Color(uiColor: .systemBackground))
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { ConversationView(id: $0) }
            .sheet(isPresented: $sidebar, onDismiss: {
                if settingsAfterSidebar {
                    settingsAfterSidebar = false
                    showSettings = true
                }
            }) { sidebarView.presentationDetents([.large]) }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .sheet(item: $compose, onDismiss: { Task { await store.refresh() } }) { ComposeView(initial: $0) }
            .task(id: "\(store.label)|\(store.category)|\(store.search)") {
                do {
                    if !store.search.isEmpty { try await Task.sleep(for: .milliseconds(350)) }
                    try Task.checkCancellation()
                    await store.refresh()
                } catch {}
            }
        }
        .tint(.mailAction)
    }

    private var header: some View {
        MailHeader {
            Button { searching = false; sidebar = true } label: {
                MailMark().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Open mailboxes")
            Menu {
                Button("Mailboxes", systemImage: "tray.full") { sidebar = true }
                if store.label == "INBOX" {
                    Picker("Inbox category", selection: $store.category) {
                        Text("All categories").tag("")
                        ForEach(categories, id: \.0) { id, name, _ in Text(name).tag(id) }
                    }
                }
                Button("Settings", systemImage: "gearshape") { showSettings = true }
            } label: {
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(store.title).font(.headline).lineLimit(1)
                        if store.label == "INBOX" && !store.category.isEmpty && store.search.isEmpty {
                            Text(categories.first { $0.0 == store.category }?.1 ?? "Primary")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Image(systemName: "chevron.down").font(.caption2).foregroundStyle(.secondary)
                    if let unread = store.settings?.counts[store.label]?.unread, unread > 0 {
                        Text("\(unread)").font(.caption).foregroundStyle(.secondary)
                            .accessibilityLabel("\(unread) unread messages")
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }.foregroundStyle(.primary)
            Spacer(minLength: 0)
            if store.loading { ProgressView().controlSize(.mini).accessibilityLabel("Refreshing mailbox") }
            MailIconButton(symbol: "magnifyingglass", label: "Search mail") {
                showSearch = true
                searching = true
            }
            MailIconButton(symbol: "square.and.pencil", label: "Compose", emphasized: true) {
                searching = false
                compose = Draft()
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search mail", text: $store.search)
                .font(.body).focused($searching).submitLabel(.search)
                .onSubmit { searching = false }
                .autocorrectionDisabled().textInputAutocapitalization(.never)
                .accessibilityLabel("Search mail")
            Button {
                store.search = ""
                searching = false
                showSearch = false
            } label: {
                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44)
            }.accessibilityLabel("Close search")
        }
        .padding(.leading, 12).background(Color.mailSurface, in: RoundedRectangle(cornerRadius: 9))
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private var threadList: some View {
        List {
            ForEach(store.threads) { thread in
                HStack(alignment: .top, spacing: 4) {
                    Button { searching = false; store.path.append(thread.id) } label: { ThreadRow(thread: thread) }
                        .buttonStyle(.plain)
                    if thread.starred {
                        MailIconButton(symbol: "star.fill", label: "Unstar \(thread.subject)") {
                            Task { await store.action(thread.id, "unstar") }
                        }
                    }
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 8, bottom: 12, trailing: 20))
                .listRowSeparatorTint(Color.primary.opacity(0.08))
                .alignmentGuide(.listRowSeparatorLeading) { dimensions in dimensions[.leading] + 12 }
                .contextMenu {
                    Button(thread.starred ? "Unstar" : "Star", systemImage: thread.starred ? "star.slash" : "star") {
                        Task { await store.action(thread.id, thread.starred ? "unstar" : "star") }
                    }
                    Button(thread.unread > 0 ? "Mark read" : "Mark unread", systemImage: "envelope") {
                        Task { await store.action(thread.id, thread.unread > 0 ? "read" : "unread") }
                    }
                }
                .swipeActions(edge: .trailing) {
                    Button("Trash", role: .destructive) { Task { await store.action(thread.id, "trash") } }
                    Button("Archive", systemImage: "archivebox") { Task { await store.action(thread.id, "archive") } }.tint(.mailAction)
                }
                .swipeActions(edge: .leading) {
                    Button(thread.unread > 0 ? "Mark read" : "Mark unread", systemImage: thread.unread > 0 ? "envelope.open" : "envelope.badge") {
                        Task { await store.action(thread.id, thread.unread > 0 ? "read" : "unread") }
                    }.tint(.mailAction)
                    Button(thread.starred ? "Unstar" : "Star", systemImage: "star") {
                        Task { await store.action(thread.id, thread.starred ? "unstar" : "star") }
                    }.tint(.gray)
                }
            }
            if store.threads.count < store.total {
                Button("Load more messages") { Task { await store.loadMore() } }
                    .frame(maxWidth: .infinity).padding()
            }
        }
        .listStyle(.plain).contentMargins(.top, 0, for: .scrollContent)
        .refreshable { await store.refresh() }
        .overlay { if store.threads.isEmpty && !store.loading && store.error == nil { emptyState } }
    }

    private var draftList: some View {
        List {
            ForEach(store.drafts) { draft in
                Button { searching = false; compose = draft } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(draft.to.isEmpty ? "No recipient" : draft.to).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("Draft").font(.caption).foregroundStyle(.secondary)
                        }
                        Text(draft.subject.isEmpty ? "(no subject)" : draft.subject).font(.subheadline).lineLimit(1)
                        Text(draft.body).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }.foregroundStyle(.primary).padding(.vertical, 6)
                }
                .swipeActions { Button("Delete", role: .destructive) { Task { await deleteDraft(draft) } } }
            }
        }
        .listStyle(.plain).contentMargins(.top, 0, for: .scrollContent)
        .refreshable { await store.refresh() }
        .overlay { if store.drafts.isEmpty && !store.loading && store.error == nil { emptyState } }
    }

    private func connectionError(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Couldn't connect to Mailthing", systemImage: "wifi.exclamationmark").font(.subheadline.bold())
            Text(error).font(.caption)
            HStack {
                Button("Retry") { Task { await store.refresh() } }
                Spacer()
                Button("Server settings") { showSettings = true }
            }.font(.caption.bold())
        }.padding().background(Color.mailSurface, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private var emptyState: some View {
        ContentUnavailableView(store.search.isEmpty ? "You're all caught up" : "No matching messages", systemImage: store.search.isEmpty ? "tray" : "magnifyingglass", description: Text(store.search.isEmpty ? "Messages in \(store.title.lowercased()) will appear here." : "Try another name, subject, or search filter."))
    }

    private var sidebarView: some View {
        NavigationStack {
            VStack(spacing: 0) {
                MailHeader {
                    MailIconButton(symbol: "xmark", label: "Close mailboxes") { sidebar = false }
                    Text("Mailboxes").font(.headline)
                    Spacer()
                    MailIconButton(symbol: "gearshape", label: "Settings") {
                        settingsAfterSidebar = true
                        sidebar = false
                    }
                }
                List {
                    MailAccountCard(account: store.settings?.account)
                        .listRowSeparator(.hidden)
                    ForEach(mailboxes, id: \.0) { id, title, icon in
                        Button { selectMailbox(id) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: icon).frame(width: 20).foregroundStyle(.secondary)
                                Text(title).fontWeight(store.label == id ? .semibold : .regular)
                                Spacer()
                                if let count = store.settings?.counts[id], count.unread > 0 {
                                    Text("\(count.unread)").font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(.vertical, 3)
                        }.foregroundStyle(.primary)
                            .listRowBackground(store.label == id ? Color.mailTint : Color(uiColor: .systemBackground))
                    }
                    Section("Inbox categories") {
                        categoryRow(id: "", name: "All categories", icon: "tray.full")
                        ForEach(categories, id: \.0) { id, name, icon in categoryRow(id: id, name: name, icon: icon) }
                    }
                    if let labels = store.settings?.labels.filter({ $0.kind == "user" }), !labels.isEmpty {
                        Section("Labels") {
                            ForEach(labels) { label in
                                Button { selectMailbox(label.id) } label: { Label(label.name, systemImage: "tag") }
                                    .foregroundStyle(.primary)
                                    .listRowBackground(store.label == label.id ? Color.mailTint : Color(uiColor: .systemBackground))
                            }
                        }
                    }
                }
                .listStyle(.plain).contentMargins(.top, 0, for: .scrollContent)
            }.toolbar(.hidden, for: .navigationBar)
        }.tint(.mailAction)
    }

    private func categoryRow(id: String, name: String, icon: String) -> some View {
        Button {
            store.category = id
            selectMailbox("INBOX")
        } label: {
            HStack {
                Label(name, systemImage: icon)
                Spacer()
                if store.label == "INBOX" && store.category == id { Image(systemName: "checkmark").font(.caption) }
            }
        }.foregroundStyle(.primary)
    }

    private func selectMailbox(_ id: String) {
        store.select(id)
        showSearch = false
        searching = false
        sidebar = false
    }

    private func deleteDraft(_ draft: Draft) async {
        do { let _: EmptyReply = try await store.api.request("drafts/\(draft.id)", method: "DELETE"); await store.refresh() }
        catch { store.error = error.localizedDescription }
    }
}

struct ThreadRow: View {
    var thread: MailThread
    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Circle().fill(thread.unread > 0 ? Color.mailAction : .clear)
                .frame(width: 5, height: 5).padding(.top, 7).frame(width: 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.sender.isEmpty ? thread.senderEmail : thread.sender)
                        .font(.subheadline.weight(thread.unread > 0 ? .semibold : .regular)).lineLimit(1)
                    if thread.count > 1 { Text("\(thread.count)").font(.caption).foregroundStyle(.secondary) }
                    Spacer(minLength: 0)
                    Text(thread.date, format: thread.date.isToday ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Text(thread.subject.isEmpty ? "(no subject)" : thread.subject)
                    .font(.subheadline.weight(thread.unread > 0 ? .medium : .regular)).lineLimit(1)
                Text(thread.snippet).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                if thread.hasAttachment { Label("Attachment", systemImage: "paperclip").font(.caption2).foregroundStyle(.secondary).padding(.top, 2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(.primary)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(thread.unread > 0 ? "Unread" : "Read")
    }
}
extension Date { var isToday: Bool { Calendar.current.isDateInToday(self) } }
