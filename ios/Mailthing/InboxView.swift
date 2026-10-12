import SwiftUI

extension Color {
    static let mailBlue = Color(red: 0.10, green: 0.32, blue: 0.72)
    static let mailSurface = Color(uiColor: .secondarySystemBackground)
    static let mailTint = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.14, green: 0.23, blue: 0.37, alpha: 1) : UIColor(red: 0.83, green: 0.89, blue: 1, alpha: 1) })
}

struct InboxView: View {
    @EnvironmentObject private var store: MailStore
    @Environment(\.scenePhase) private var phase
    @State private var sidebar = false
    @State private var showSettings = false
    @State private var compose: Draft?
    @FocusState private var searching: Bool
    var body: some View {
        NavigationStack(path: $store.path) {
            VStack(spacing: 0) {
                searchBar
                if store.label == "INBOX" && store.search.isEmpty { categories }
                HStack {
                    Text(store.title.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(1.6).foregroundStyle(.secondary)
                    Spacer()
                    if store.loading { ProgressView().controlSize(.mini) }
                    else { Text("\(store.total)").font(.caption).foregroundStyle(.secondary) }
                }.padding(.horizontal, 22).padding(.top, 18).padding(.bottom, 8)
                if let error = store.error {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Couldn't connect to Mailthing", systemImage: "wifi.exclamationmark").font(.subheadline.bold())
                        Text(error).font(.caption)
                        HStack {
                            Button("Retry") { Task { await store.refresh() } }
                            Spacer()
                            Button("Server settings") { showSettings = true }
                        }.font(.caption.bold())
                    }.padding().background(Color.mailSurface).clipShape(RoundedRectangle(cornerRadius: 16)).padding(.horizontal, 16)
                }
                if store.label == "DRAFTS" && store.search.isEmpty {
                    List {
                        ForEach(store.drafts) { draft in
                            Button { compose = draft } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack { Text(draft.to.isEmpty ? "No recipient" : draft.to).fontWeight(.semibold); Spacer(); Text("Draft").foregroundStyle(.red).font(.caption) }
                                    Text(draft.subject.isEmpty ? "(no subject)" : draft.subject).lineLimit(1)
                                    Text(draft.body).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                                }.foregroundStyle(.primary).padding(.vertical, 8)
                            }
                            .swipeActions { Button("Delete", role: .destructive) { Task { await deleteDraft(draft) } } }
                        }
                    }.listStyle(.plain).refreshable { await store.refresh() }.overlay { if store.drafts.isEmpty && !store.loading && store.error == nil { emptyState } }
                } else {
                    List {
                        ForEach(store.threads) { thread in
                            HStack(alignment: .top, spacing: 12) {
                                Button { store.path.append(thread.id) } label: {
                                    ThreadRow(thread: thread)
                                }.buttonStyle(.plain)
                                Button { Task { await store.action(thread.id, thread.starred ? "unstar" : "star") } } label: {
                                    Image(systemName: thread.starred ? "star.fill" : "star").font(.system(size: 19)).foregroundStyle(thread.starred ? Color.yellow : Color.secondary).frame(width: 28, height: 44)
                                }.buttonStyle(.plain).accessibilityLabel(thread.starred ? "Unstar \(thread.subject)" : "Star \(thread.subject)")
                            }
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 10, leading: 20, bottom: 10, trailing: 14))
                            .swipeActions(edge: .trailing) {
                                Button("Trash", role: .destructive) { Task { await store.action(thread.id, "trash") } }
                                Button("Archive", systemImage: "archivebox") { Task { await store.action(thread.id, "archive") } }.tint(.green)
                            }
                            .swipeActions(edge: .leading) {
                                Button(thread.unread > 0 ? "Mark read" : "Mark unread", systemImage: thread.unread > 0 ? "envelope.open" : "envelope.badge") { Task { await store.action(thread.id, thread.unread > 0 ? "read" : "unread") } }.tint(.mailBlue)
                            }
                        }
                        if store.threads.count < store.total {
                            Button("Load more messages") { Task { await store.loadMore() } }.frame(maxWidth: .infinity).padding()
                        }
                        Color.clear.frame(height: 90).listRowSeparator(.hidden)
                    }.listStyle(.plain).refreshable { await store.refresh() }
                        .overlay { if store.threads.isEmpty && !store.loading && store.error == nil { emptyState } }
                }
            }
            .background(Color(uiColor: .systemBackground))
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottomTrailing) {
                Button { compose = Draft() } label: {
                    Label("Compose", systemImage: "pencil").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 22).padding(.vertical, 20)
                }.foregroundStyle(.primary).background(Color.mailTint).clipShape(RoundedRectangle(cornerRadius: 20)).shadow(color: .black.opacity(0.12), radius: 14, y: 5).padding(20)
            }
            .navigationDestination(for: String.self) { ConversationView(id: $0) }
            .sheet(isPresented: $sidebar) { sidebarView.presentationDetents([.large]) }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .sheet(item: $compose, onDismiss: { Task { await store.refresh() } }) { ComposeView(initial: $0) }
            .task(id: "\(store.label)|\(store.category)|\(store.search)") {
                do { if !store.search.isEmpty { try await Task.sleep(for: .milliseconds(350)) }; try Task.checkCancellation(); await store.refresh() } catch {}
            }
            .task(id: phase) {
                guard phase == .active else { return }
                await store.notificationStatus()
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(20)); try Task.checkCancellation(); await store.refresh() } catch { break }
                }
            }
        }.tint(.mailBlue)
    }
    private var searchBar: some View {
        HStack(spacing: 14) {
            Button { sidebar = true } label: { Image(systemName: "line.3.horizontal").font(.system(size: 21)).frame(width: 26, height: 44) }.accessibilityLabel("Open mailbox menu")
            TextField("Search in mail", text: $store.search).font(.system(size: 17)).focused($searching).submitLabel(.search).onSubmit { searching = false }.autocorrectionDisabled().textInputAutocapitalization(.never)
            if !store.search.isEmpty {
                Button { store.search = ""; searching = false } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel("Clear search")
            } else {
                Button { showSettings = true } label: {
                    Text(String(store.settings?.account.name.prefix(1) ?? "M")).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 34, height: 34).background(Color.mailBlue).clipShape(Circle())
                }.accessibilityLabel("Account and settings")
            }
        }.foregroundStyle(.primary).padding(.horizontal, 16).padding(.vertical, 5).background(Color.mailSurface).clipShape(RoundedRectangle(cornerRadius: 30)).padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 8)
    }
    private var categories: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach([("CATEGORY_PERSONAL", "Primary", "tray"), ("CATEGORY_PROMOTIONS", "Promotions", "tag"), ("CATEGORY_SOCIAL", "Social", "person.2"), ("CATEGORY_UPDATES", "Updates", "info.circle")], id: \.0) { id, name, icon in
                    Button { store.category = id } label: {
                        Label(name, systemImage: icon).font(.system(size: 13, weight: store.category == id ? .semibold : .regular)).padding(.horizontal, 16).padding(.vertical, 12)
                    }.foregroundStyle(store.category == id ? Color.mailBlue : Color.secondary).background(store.category == id ? Color.mailTint : Color.mailSurface.opacity(0.5)).clipShape(Capsule())
                }
            }.padding(.horizontal, 18).padding(.vertical, 6)
        }
    }
    private var emptyState: some View {
        ContentUnavailableView(store.search.isEmpty ? "You're all caught up" : "No matching messages", systemImage: store.search.isEmpty ? "tray" : "magnifyingglass", description: Text(store.search.isEmpty ? "Messages in \(store.title.lowercased()) will appear here." : "Try another name, subject, or search filter."))
    }
    private var sidebarView: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Mailthing").font(.largeTitle.weight(.semibold))
                        Text(store.settings?.account.email ?? "Your personal inbox").foregroundStyle(.secondary)
                    }.padding(.vertical, 12)
                }
                Section {
                    ForEach([("INBOX", "Inbox", "tray"), ("UNREAD", "Unread", "envelope.badge"), ("STARRED", "Starred", "star"), ("SNOOZED", "Snoozed", "clock"), ("IMPORTANT", "Important", "chevron.right.2"), ("SENT", "Sent", "paperplane"), ("DRAFTS", "Drafts", "doc"), ("ALL", "All mail", "envelope"), ("SPAM", "Spam", "exclamationmark.octagon"), ("TRASH", "Trash", "trash")], id: \.0) { id, title, icon in
                        Button { store.select(id); sidebar = false } label: {
                            HStack { Label(title, systemImage: icon); Spacer(); if let count = store.settings?.counts[id], count.unread > 0 { Text("\(count.unread)").font(.caption.weight(.semibold)) } }
                        }.foregroundStyle(store.label == id ? Color.mailBlue : Color.primary).listRowBackground(store.label == id ? Color.mailTint : Color(uiColor: .secondarySystemGroupedBackground))
                    }
                }
                if let labels = store.settings?.labels.filter({ $0.kind == "user" }), !labels.isEmpty {
                    Section("Labels") { ForEach(labels) { label in Button { store.select(label.id); sidebar = false } label: { Label(label.name, systemImage: "tag") }.foregroundStyle(.primary) } }
                }
                Section { Button { sidebar = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { showSettings = true } } label: { Label("Settings", systemImage: "gearshape") } }
            }.toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { sidebar = false } } }
        }
    }
    private func deleteDraft(_ draft: Draft) async {
        do { let _: EmptyReply = try await store.api.request("drafts/\(draft.id)", method: "DELETE"); await store.refresh() }
        catch { store.error = error.localizedDescription }
    }
}

struct ThreadRow: View {
    var thread: MailThread
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(String((thread.sender.isEmpty ? thread.senderEmail : thread.sender).prefix(1)).uppercased()).font(.system(size: 20, weight: .medium)).foregroundStyle(.white).frame(width: 44, height: 44).background(avatarColor).clipShape(Circle()).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.sender.isEmpty ? thread.senderEmail : thread.sender).font(.system(size: 16, weight: thread.unread > 0 ? .bold : .regular)).lineLimit(1)
                    if thread.count > 1 { Text("\(thread.count)").font(.caption).foregroundStyle(.secondary) }
                    Spacer(minLength: 0)
                    Text(thread.date, format: thread.date.isToday ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day()).font(.system(size: 11, weight: thread.unread > 0 ? .bold : .regular))
                }
                Text(thread.subject.isEmpty ? "(no subject)" : thread.subject).font(.system(size: 14, weight: thread.unread > 0 ? .semibold : .regular)).lineLimit(1)
                Text(thread.snippet).font(.system(size: 14)).foregroundStyle(.secondary).lineLimit(2)
                if thread.hasAttachment { Label("Attachment", systemImage: "paperclip").font(.caption).foregroundStyle(.secondary).padding(.top, 2) }
            }
        }.foregroundStyle(.primary).padding(.vertical, 3)
    }
    private var avatarColor: Color {
        let colors: [Color] = [.mailBlue, .teal, .purple, .brown, .indigo, .orange]
        let index = thread.senderEmail.utf8.reduce(0) { ($0 + Int($1)) % colors.count }
        return colors[index]
    }
}
extension Date { var isToday: Bool { Calendar.current.isDateInToday(self) } }
