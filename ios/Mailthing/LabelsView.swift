import SwiftUI

struct LabelsView: View {
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    var onOpen: ((String) -> Void)?
    @State private var search = ""
    @State private var creating = false
    @State private var editing: MailLabel?

    private var matches: [MailLabel] {
        store.userLabels.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        List {
            if let error = store.error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Retry") { Task { await store.refresh() } }
                }
            }
            if store.userLabels.isEmpty {
                Section {
                    VStack(spacing: 14) {
                        Image(systemName: "tag").font(.largeTitle).foregroundStyle(.secondary)
                        Text("A little order, your way.").font(.title3.weight(.semibold))
                        Text("Create labels for projects, receipts, or anything you want to find later.")
                            .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button("Create your first label", systemImage: "plus") { creating = true }
                            .frame(minHeight: 44)
                    }.frame(maxWidth: .infinity).padding(.vertical, 32)
                }.listRowSeparator(.hidden)
            } else if matches.isEmpty {
                ContentUnavailableView.search(text: search)
            } else {
                Section {
                    ForEach(matches) { label in
                        HStack(spacing: 8) {
                            Button {
                                if let onOpen { onOpen(label.id) }
                                else { store.select(label.id); dismiss() }
                            } label: {
                                HStack(spacing: 12) {
                                    LabelDot(hex: label.color)
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(label.name).foregroundStyle(.primary)
                                        let count = store.settings?.counts[label.id] ?? MailCount(total: 0, unread: 0)
                                        Text("\(count.total) \(count.total == 1 ? "conversation" : "conversations")\(count.unread > 0 ? " · \(count.unread) unread" : "")")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                    if label.isPinned { Image(systemName: "pin").font(.caption).foregroundStyle(.secondary).accessibilityLabel("Pinned") }
                                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                            }.buttonStyle(.plain).accessibilityHint("Show conversations with this label")
                            MailIconButton(symbol: "pencil", label: "Edit \(label.name)") { editing = label }
                                .buttonStyle(.borderless)
                        }.padding(.vertical, 3)
                    }
                } header: { Text("Your labels") } footer: {
                    Text("Edit a label to pin it or add sorting guidance. Applying or removing labels teaches Mailthing too.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.plain)
        .background(Color.mailCanvas)
        .navigationTitle("Labels")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .primaryAction) { Button("New label", systemImage: "plus") { creating = true } } }
        .searchable(text: $search, prompt: "Search labels")
        .safeAreaInset(edge: .bottom) {
            if !store.userLabels.isEmpty {
                Button { creating = true } label: {
                    Label("New label", systemImage: "plus").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(Color.mailAction, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(Color.mailOnAction)
                }.padding().background(Color.mailCanvas)
            }
        }
        .navigationDestination(item: $editing) { label in LabelEditor(label: label) }
        .sheet(isPresented: $creating) { NavigationStack { LabelEditor() } }
        .task { await store.refresh() }
        .refreshable { await store.refresh() }
    }
}

struct LabelEditor: View {
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    private let label: MailLabel?
    @State private var name: String
    @State private var color: Color
    @State private var pinned: Bool
    @State private var guidance = ""
    @State private var exampleCount = 0
    @State private var loaded: Bool
    @State private var loading = false
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false

    init(label: MailLabel? = nil) {
        self.label = label
        _name = State(initialValue: label?.name ?? "")
        _color = State(initialValue: Color(mailLabelHex: label?.color ?? "#777d88"))
        _pinned = State(initialValue: label?.isPinned ?? true)
        _loaded = State(initialValue: label == nil)
    }

    private var update: MailLabelUpdate {
        MailLabelUpdate(name: name.trimmingCharacters(in: .whitespacesAndNewlines), color: color.mailLabelHex, pinned: pinned, guidance: guidance)
    }

    var body: some View {
        Form {
            if loading { Section { ProgressView("Loading label…") } }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    if !loaded { Button("Retry") { Task { await load() } }.disabled(loading) }
                }
            }
            Section {
                TextField("Name", text: $name).accessibilityLabel("Label name")
                if name.trimmingCharacters(in: .whitespacesAndNewlines).utf8.count > 50 {
                    Text("Choose a shorter label name (50 bytes maximum).").font(.caption).foregroundStyle(.red)
                }
                ColorPicker("Color", selection: $color, supportsOpacity: false)
                Toggle("Pin to mailboxes", isOn: $pinned)
            }.disabled(!loaded || busy)
            Section {
                TextEditor(text: $guidance).frame(minHeight: 130).accessibilityLabel("Sorting guidance")
                if guidance.unicodeScalars.count > 2000 {
                    Text("Keep guidance within 2,000 characters.").font(.caption).foregroundStyle(.red)
                }
            } header: { Text("Sorting guidance") } footer: {
                Text("Help Mailthing recognize mail for this label. Applying or removing labels teaches it too. Your filters take precedence.")
            }.disabled(!loaded || busy)
            if label != nil {
                Section { LabeledContent("Remembered examples", value: String(exampleCount)) }
                Section {
                    Button("Delete label", role: .destructive) { confirmDelete = true }.disabled(!loaded || busy)
                } footer: { Text("Deleting a label keeps your messages.") }
            }
        }
        .navigationTitle(label == nil ? "New label" : "Edit label")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            if label == nil { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
            ToolbarItem(placement: .confirmationAction) {
                Button { Task { await save() } } label: {
                    if busy { ProgressView() } else { Text(label == nil ? "Create" : "Save").fontWeight(.semibold) }
                }.disabled(!loaded || busy || !update.isValid)
            }
        }
        .interactiveDismissDisabled(busy)
        .confirmationDialog("Delete “\(label?.name ?? name)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete label", role: .destructive) { Task { await remove() } }
            Button("Keep label", role: .cancel) {}
        } message: { Text("This removes the label, its sorting memory, and any filters that apply it. Your messages will be kept.") }
        .task { if label != nil { await load() } }
    }

    private func load() async {
        guard let label, !loading else { return }
        loading = true; error = nil
        defer { loading = false }
        do {
            let detail: MailLabelDetail = try await store.api.request("labels/\(label.id)")
            name = detail.name; color = Color(mailLabelHex: detail.color); pinned = detail.pinned
            guidance = detail.guidance; exampleCount = detail.exampleCount; loaded = true
        } catch is CancellationError {} catch let failure as URLError where failure.code == .cancelled {} catch { self.error = error.localizedDescription }
    }

    private func save() async {
        guard loaded, update.isValid, !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let saved: MailLabel = try await store.api.request(label.map { "labels/\($0.id)" } ?? "labels", method: label == nil ? "POST" : "PUT", body: JSONEncoder.mailthing.encode(update))
            store.labelChanged(saved)
            dismiss()
            await store.refresh()
        } catch { self.error = error.localizedDescription }
    }

    private func remove() async {
        guard let label, !busy else { return }
        busy = true; error = nil
        defer { busy = false }
        do {
            let _: EmptyReply = try await store.api.request("labels/\(label.id)", method: "DELETE")
            store.labelChanged(label, deleted: true)
            dismiss()
            await store.refresh()
        } catch { self.error = error.localizedDescription }
    }
}

struct LabelDot: View {
    let hex: String
    var body: some View { Circle().fill(Color(mailLabelHex: hex)).frame(width: 9, height: 9).accessibilityHidden(true) }
}

extension Color {
    init(mailLabelHex: String) {
        let value = UInt32(mailLabelHex.dropFirst(), radix: 16) ?? 0x777d88
        self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
    var mailLabelHex: String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return String(format: "#%02x%02x%02x", Int((red * 255).rounded()), Int((green * 255).rounded()), Int((blue * 255).rounded()))
    }
}
