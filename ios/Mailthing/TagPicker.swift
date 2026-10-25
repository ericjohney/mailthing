import SwiftUI

struct TagTarget: Identifiable { let id: String }

struct TagUpdate: Encodable {
    var threadIds: [String]
    let action = "set_labels"
    var labelIds: [String]
}

struct TagChips: View {
    var labels: [MailLabel]
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                ForEach(labels) { label in
                    Label(label.name, systemImage: "tag")
                        .font(.caption2).padding(.horizontal, 7).padding(.vertical, 4)
                        .background(Color.mailTint, in: Capsule())
                }
            }
        }.accessibilityElement(children: .combine)
            .accessibilityLabel("Tags: \(labels.map(\.name).joined(separator: ", "))")
    }
}

struct TagPicker: View {
    let threadID: String
    var onSave: () -> Void = {}
    @EnvironmentObject private var store: MailStore
    @Environment(\.dismiss) private var dismiss
    @State private var labels: [MailLabel] = []
    @State private var selected = Set<String>()
    @State private var search = ""
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?
    private var name: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var matches: [MailLabel] {
        labels.filter { name.isEmpty || $0.name.localizedCaseInsensitiveContains(name) }
    }
    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Section {
                        Text(error).font(.callout).foregroundStyle(.red)
                        if !loaded { Button("Retry") { Task { await load() } } }
                    }
                }
                if !loaded && error == nil { ProgressView("Loading tags…") }
                ForEach(matches) { label in
                    Button {
                        if !selected.insert(label.id).inserted { selected.remove(label.id) }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "tag").foregroundStyle(.secondary)
                            Text(label.name).foregroundStyle(.primary)
                            Spacer()
                            if selected.contains(label.id) { Image(systemName: "checkmark").foregroundStyle(Color.mailAction) }
                        }.frame(minHeight: 32).contentShape(Rectangle())
                    }.disabled(busy || !loaded)
                        .accessibilityValue(selected.contains(label.id) ? "Selected" : "Not selected")
                }
                if loaded && labels.isEmpty && name.isEmpty {
                    Text("Create a tag for projects, receipts, or anything you want to find later.")
                        .foregroundStyle(.secondary).font(.callout)
                }
                if loaded && !name.isEmpty && !labels.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                    Button { Task { await create() } } label: { Label("Create “\(name)”", systemImage: "plus") }
                        .disabled(busy || name.utf8.count > 50)
                    if name.utf8.count > 50 { Text("Choose a shorter tag name.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            .searchable(text: $search, prompt: "Find or create a tag")
            .navigationTitle("Tags").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await save() } } label: {
                        if busy { ProgressView() } else { Text("Save").fontWeight(.semibold) }
                    }.disabled(!loaded || busy)
                }
            }
            .task { await load() }
        }
        .tint(.mailAction)
        .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        .interactiveDismissDisabled(busy)
    }
    private func load() async {
        error = nil
        do {
            async let all: [MailLabel] = store.api.request("labels")
            async let thread: Conversation = store.api.request("threads/\(threadID)")
            let (available, conversation) = try await (all, thread)
            labels = available.filter { $0.kind == "user" }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            selected = Set(conversation.labels.filter { $0.kind == "user" }.map(\.id))
            loaded = true
        } catch { self.error = error.localizedDescription }
    }
    private func create() async {
        busy = true; defer { busy = false }
        do {
            let label: MailLabel = try await store.api.request("labels", method: "POST", body: JSONSerialization.data(withJSONObject: ["name": name, "color": "#808080"]))
            labels.append(label); labels.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            selected.insert(label.id); search = ""; error = nil
            await store.refresh()
        } catch { self.error = error.localizedDescription }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            let update = TagUpdate(threadIds: [threadID], labelIds: selected.sorted())
            let _: EmptyReply = try await store.api.request("actions", method: "POST", body: JSONEncoder.mailthing.encode(update))
            await store.refresh(); onSave(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
