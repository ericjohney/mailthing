import SwiftUI

struct InboxView: View {
    @EnvironmentObject private var store: MailStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sidebar = false
    @State private var drawerDrag: CGFloat = 0
    @GestureState private var draggingDrawer = false
    @State private var showSettings = false
    @State private var showLabels = false
    @State private var createLabel = false
    @State private var moreMailboxes = false
    @State private var compose: Draft?
    @State private var tags: TagTarget?
    @State private var showSearch = false
    @FocusState private var searching: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    private let mailboxes = [("INBOX", "Inbox", "tray"), ("UNREAD", "Unread", "envelope.badge"), ("STARRED", "Starred", "star"), ("SNOOZED", "Snoozed", "clock"), ("IMPORTANT", "Important", "chevron.right.2"), ("SENT", "Sent", "paperplane"), ("DRAFTS", "Drafts", "doc"), ("ALL", "All mail", "envelope"), ("SPAM", "Spam", "exclamationmark.octagon"), ("TRASH", "Trash", "trash")]

    var body: some View {
        NavigationStack(path: $store.path) {
            GeometryReader { geometry in
                let panelWidth = min(geometry.size.width - 56, 340)
                let offset = min(panelWidth, max(0, (sidebar ? panelWidth : 0) + drawerDrag))
                ZStack(alignment: .leading) {
                    sidebarView
                        .frame(width: panelWidth, height: geometry.size.height)
                        .disabled(drawerDrag != 0)
                        .accessibilityElement(children: .contain)
                        .accessibilityHidden(!sidebar)
                        .allowsHitTesting(sidebar)
                    inboxContent
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .accessibilityElement(children: .contain)
                        .accessibilityHidden(sidebar)
                        .allowsHitTesting(!sidebar)
                        .overlay {
                            if sidebar {
                                Button { setSidebar(false) } label: {
                                    Color.black.opacity(0.08).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Close mailbox menu")
                            }
                        }
                        // Keep the slide on this container instead of pushing
                        // its geometry into independently animated button labels.
                        .geometryGroup()
                        .shadow(color: .black.opacity(offset > 0 ? 0.16 : 0), radius: 18, x: -5)
                        .offset(x: offset)
                    if !sidebar {
                        Color.clear
                            .frame(width: 20)
                            .contentShape(Rectangle())
                            .gesture(drawerGesture(panelWidth: panelWidth))
                            .accessibilityHidden(true)
                    }
                }
                .background(Color.mailSurface)
                .clipped()
                .simultaneousGesture(sidebar ? drawerGesture(panelWidth: panelWidth) : nil)
                .accessibilityAction(.escape) { setSidebar(false) }
                .onChange(of: draggingDrawer) { _, dragging in
                    if !dragging && drawerDrag != 0 { setSidebar(sidebar) }
                }
            }
            .background(Color.mailCanvas.ignoresSafeArea())
            .navigationDestination(for: String.self) { ConversationView(id: $0) }
            .navigationDestination(isPresented: $showSettings) { SettingsView() }
            .navigationDestination(isPresented: $showLabels) {
                LabelsView(onOpen: { id in showLabels = false; selectMailbox(id) })
            }
            .sheet(isPresented: $createLabel) { NavigationStack { LabelEditor() } }
            .sheet(item: $tags) { target in TagPicker(threadID: target.id) }
            .sheet(item: $compose, onDismiss: { Task { await store.refresh() } }) { ComposeView(initial: $0) }
            .onChange(of: store.label) { _, id in
                if mailboxes.dropFirst(3).contains(where: { $0.0 == id }) { moreMailboxes = true }
            }
            .task(id: "\(store.label)|\(store.search)") {
                do {
                    if !store.search.isEmpty { try await Task.sleep(for: .milliseconds(350)) }
                    try Task.checkCancellation()
                    await store.refresh()
                } catch {}
            }
        }
        .tint(.mailAction)
        .onChange(of: store.path) { _, path in
            if !path.isEmpty { setSidebar(false) }
        }
    }

    private var inboxContent: some View {
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
        .background(Color.mailCanvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private func setSidebar(_ open: Bool) {
        searching = false
        withAnimation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.9)) {
            sidebar = open
            // Commit the drag reset with the destination so the slide continues
            // from the finger position instead of jumping to the starting edge.
            drawerDrag = 0
        }
    }
    private func drawerGesture(panelWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .updating($draggingDrawer) { _, state, _ in state = true }
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                drawerDrag = value.translation.width
            }
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else {
                    setSidebar(sidebar)
                    return
                }
                let destination = (sidebar ? panelWidth : 0) + value.predictedEndTranslation.width
                setSidebar(destination > panelWidth / 2)
            }
    }

    private var header: some View {
        let textLayout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0)) : AnyLayout(HStackLayout(spacing: 10))
        return HStack(alignment: .center, spacing: 8) {
            Button { setSidebar(true) } label: {
                MailMark(size: 30)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open mailboxes")
            .accessibilityHint("Shows mailboxes and labels")
            textLayout {
                Text(store.title).font(.title2.weight(.semibold)).lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                if let unread = store.settings?.counts[store.label]?.unread, unread > 0 {
                    Text("\(unread) unread").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }.layoutPriority(1)
            Spacer(minLength: 0)
            if store.loading { ProgressView().controlSize(.mini).accessibilityLabel("Refreshing mailbox") }
            MailIconButton(symbol: "magnifyingglass", label: "Search mail") {
                showSearch = true; searching = true
            }
            MailIconButton(symbol: "square.and.pencil", label: "Compose") {
                searching = false; compose = Draft()
            }
        }
        .padding(.horizontal, 12).frame(minHeight: 54)
        .background(Color.mailCanvas)
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
                    Button { searching = false; store.path.append(thread.id) } label: { ThreadRow(thread: thread, labels: store.settings?.labels.filter { $0.kind == "user" && thread.labelIds.contains($0.id) } ?? []) }
                        .buttonStyle(.plain)
                    if thread.starred {
                        MailIconButton(symbol: "star.fill", label: "Unstar \(thread.subject)") {
                            Task { await store.action(thread.id, "unstar") }
                        }
                    }
                }
                .padding(14)
                .background(thread.unread > 0 ? Color.mailSurface : Color.mailCanvas, in: RoundedRectangle(cornerRadius: 16))
                .listRowBackground(Color.mailCanvas)
                .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
                .listRowSeparator(.hidden)
                .alignmentGuide(.listRowSeparatorLeading) { dimensions in dimensions[.leading] + 12 }
                .contextMenu {
                    Button("Labels", systemImage: "tag") { tags = TagTarget(id: thread.id) }
                    Button(thread.starred ? "Unstar" : "Star", systemImage: thread.starred ? "star.slash" : "star") {
                        Task { await store.action(thread.id, thread.starred ? "unstar" : "star") }
                    }
                    Button(thread.unread > 0 ? "Mark read" : "Mark unread", systemImage: "envelope") {
                        Task { await store.action(thread.id, thread.unread > 0 ? "read" : "unread") }
                    }
                }
                .swipeActions(edge: .trailing) {
                    // Let the confirmed data update remove the row. A destructive
                    // role makes List remove it before this async action finishes.
                    Button {
                        Task { await store.action(thread.id, "trash") }
                    } label: {
                        Label("Trash", systemImage: "trash.fill")
                    }.tint(.mailSwipeTrash)
                    Button("Archive", systemImage: "archivebox.fill") {
                        Task { await store.action(thread.id, "archive") }
                    }.tint(.mailSwipeArchive)
                }
                .swipeActions(edge: .leading) {
                    Button(thread.unread > 0 ? "Read" : "Unread", systemImage: thread.unread > 0 ? "envelope.open.fill" : "envelope.badge.fill") {
                        Task { await store.action(thread.id, thread.unread > 0 ? "read" : "unread") }
                    }.tint(.mailSwipeRead)
                        .accessibilityLabel(thread.unread > 0 ? "Mark read" : "Mark unread")
                    Button("Labels", systemImage: "tag.fill") {
                        tags = TagTarget(id: thread.id)
                    }.tint(.mailSwipeTag)
                }
            }
            if store.threads.count < store.total {
                Button("Load more messages") { Task { await store.loadMore() } }
                    .frame(maxWidth: .infinity).padding()
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Color.mailCanvas)
        .contentMargins(.top, 0, for: .scrollContent)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: store.threads.map(\.id))
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
                .swipeActions {
                    Button(role: .destructive) {
                        Task { await deleteDraft(draft) }
                    } label: {
                        Label("Delete", systemImage: "trash.fill")
                    }.tint(.mailSwipeTrash)
                }
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Color.mailCanvas)
        .contentMargins(.top, 0, for: .scrollContent)
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
        VStack(spacing: 0) {
            MailHeader {
                MailIconButton(symbol: "xmark", label: "Close mailboxes") { setSidebar(false) }
                Text("Mailboxes").font(.headline)
                Spacer()
                MailIconButton(symbol: "gearshape", label: "Settings") {
                    setSidebar(false)
                    showSettings = true
                }
            }
            List {
                if let account = store.settings?.account {
                    HStack(spacing: 12) {
                        MailMark(size: 34)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(account.name).font(.subheadline.weight(.semibold))
                            Text(account.email).font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 10).listRowSeparator(.hidden)
                }
                ForEach(Array(mailboxes.prefix(3)), id: \.0) { id, title, icon in
                    mailboxRow(id, title: title, icon: icon)
                }
                Section {
                    ForEach(store.userLabels.filter(\.isPinned)) { label in
                        Button { selectMailbox(label.id) } label: {
                            HStack(spacing: 12) {
                                LabelDot(hex: label.color).frame(width: 20)
                                Text(label.name).fontWeight(store.label == label.id ? .semibold : .regular)
                                Spacer(minLength: 0)
                                if let count = store.settings?.counts[label.id], count.unread > 0 {
                                    Text("\(count.unread)").font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(minHeight: 44)
                        }.foregroundStyle(.primary)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                            .listRowBackground(store.label == label.id ? Color.mailTint : Color(uiColor: .systemBackground))
                    }
                    if store.userLabels.isEmpty {
                        Text("Create labels for projects, receipts, and anything you want to find later.")
                            .font(.caption).foregroundStyle(.secondary).listRowSeparator(.hidden)
                    } else if !store.userLabels.contains(where: \.isPinned) {
                        Text("Pin labels to keep them here.").font(.caption).foregroundStyle(.secondary).listRowSeparator(.hidden)
                    }
                    Button { setSidebar(false); createLabel = true } label: { Label("New label", systemImage: "plus").frame(minHeight: 44) }
                        .foregroundStyle(.primary)
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    if !store.userLabels.isEmpty {
                        Button { openLabels() } label: {
                            HStack {
                                Label("All labels", systemImage: "tag")
                                Spacer()
                                Text("\(store.userLabels.count)").font(.caption).foregroundStyle(.secondary)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                            }.frame(minHeight: 44)
                        }.foregroundStyle(.primary)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    }
                } header: {
                    HStack {
                        Text("Labels").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                        Spacer()
                        Button("Manage") { openLabels() }.font(.caption).frame(minWidth: 54, minHeight: 44)
                            .accessibilityLabel("Manage labels")
                    }.textCase(nil)
                }
                Section {
                    DisclosureGroup("More mailboxes", isExpanded: $moreMailboxes) {
                        ForEach(Array(mailboxes.dropFirst(3)), id: \.0) { id, title, icon in
                            mailboxRow(id, title: title, icon: icon)
                        }
                    }.foregroundStyle(.primary)
                }
            }
            .listStyle(.plain).contentMargins(.top, 0, for: .scrollContent)
        }
        .background(Color(uiColor: .systemBackground))
    }

    private func mailboxRow(_ id: String, title: String, icon: String) -> some View {
        Button { selectMailbox(id) } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).frame(width: 20).foregroundStyle(.secondary)
                Text(title).fontWeight(store.label == id ? .semibold : .regular)
                Spacer(minLength: 0)
                let count = store.settings?.counts[id]
                if let value = id == "DRAFTS" ? count?.total : count?.unread, value > 0 {
                    Text("\(value)").font(.caption).foregroundStyle(.secondary)
                }
            }.frame(minHeight: 44)
        }.foregroundStyle(.primary)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            .listRowBackground(store.label == id ? Color.mailTint : Color(uiColor: .systemBackground))
    }

    private func openLabels() {
        searching = false
        setSidebar(false)
        showLabels = true
    }

    private func selectMailbox(_ id: String) {
        store.select(id)
        showSearch = false
        searching = false
        setSidebar(false)
    }

    private func deleteDraft(_ draft: Draft) async {
        do { let _: EmptyReply = try await store.api.request("drafts/\(draft.id)", method: "DELETE"); await store.refresh() }
        catch { store.error = error.localizedDescription }
    }
}

struct ThreadRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var thread: MailThread
    var labels: [MailLabel] = []
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if !typeSize.isAccessibilitySize { SenderAvatar(name: thread.sender, email: thread.senderEmail, unread: thread.unread > 0) }
            VStack(alignment: .leading, spacing: 4) {
                if typeSize.isAccessibilitySize {
                    HStack(alignment: .center) {
                        SenderAvatar(name: thread.sender, email: thread.senderEmail, unread: thread.unread > 0)
                        Spacer(minLength: 4)
                        Text(thread.date, format: .dateTime.month(.abbreviated).day()).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Text(thread.sender.isEmpty ? thread.senderEmail : thread.sender)
                        .font(.subheadline.weight(thread.unread > 0 ? .semibold : .regular)).lineLimit(3)
                    if thread.count > 1 { Text("\(thread.count) messages").font(.caption2).foregroundStyle(.secondary) }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(thread.sender.isEmpty ? thread.senderEmail : thread.sender)
                            .font(.subheadline.weight(thread.unread > 0 ? .semibold : .regular)).lineLimit(1)
                        if thread.count > 1 { Text("\(thread.count)").font(.caption).foregroundStyle(.secondary) }
                        Spacer(minLength: 0)
                        Text(thread.date, format: thread.date.isToday ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Text(thread.subject.isEmpty ? "(no subject)" : thread.subject)
                    .font(.subheadline.weight(thread.unread > 0 ? .medium : .regular)).lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                Text(thread.snippet).font(.subheadline).foregroundStyle(.secondary).lineLimit(typeSize.isAccessibilitySize ? 3 : 2)
                if !labels.isEmpty { TagChips(labels: labels) }
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
