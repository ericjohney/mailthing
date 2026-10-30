import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: MailStore
    @AppStorage("appearance") private var appearance = "system"
    var body: some View {
        Form {
            Section { MailAccountCard(account: store.settings?.account) }
            Section("Preferences") {
                NavigationLink { LabelsView() } label: { Label("Labels", systemImage: "tag").foregroundStyle(.primary) }
                NavigationLink { NotificationSettingsView() } label: {
                    Label { HStack { Text("New mail notifications"); Spacer(); Text(store.notifications == "Enabled" ? "Enabled" : "Off").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "bell").foregroundStyle(.secondary) }
                }
                NavigationLink { MailSortingSettingsView() } label: {
                    Label { HStack { Text("Mail sorting"); Spacer(); Text(store.settings?.sortingConfigured == true ? "Configured" : "Not configured").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "tag").foregroundStyle(.secondary) }
                }
                NavigationLink { SortingMemoryView() } label: { Label("Sorting memory", systemImage: "doc.text").foregroundStyle(.primary) }
            }
            Section {
                NavigationLink { CodeAutoFillSettingsView() } label: { Label("Verification-code AutoFill", systemImage: "key").foregroundStyle(.primary) }
            }
            Section("Appearance") {
                Picker("Theme", selection: $appearance) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }.pickerStyle(.segmented)
            }
            Section("Connection") {
                NavigationLink { ServerSettingsView() } label: { Label("Mail server", systemImage: "network").foregroundStyle(.primary) }
            }
            Section("About") {
                LabeledContent("Version", value: "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))")
                LabeledContent("Sending", value: store.settings?.outboundConfigured == true ? "Configured" : "Not configured")
                Text("Mailbox identity and filters can be managed in Mailthing on the web.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .task { await store.notificationStatus() }
        .tint(.mailAction)
        .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
    }
}

private struct ServerSettingsView: View {
    @EnvironmentObject private var store: MailStore
    @State private var address = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        Form {
            Section {
                TextField("Server address", text: $address).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button { Task { await connect() } } label: {
                    HStack { Text("Connect to server"); Spacer(); if busy { ProgressView() } }
                }.disabled(busy)
                if let error { Text(error).foregroundStyle(.red).font(.caption) }
            } header: { Text("Server") } footer: {
                Text("Keep Tailscale connected to access your private mailbox. Push alerts can arrive even while the app is closed.")
            }
        }.navigationTitle("Mail server").navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .onAppear { address = store.server }
    }
    private func connect() async {
        busy = true; defer { busy = false }
        do { try await store.connect(address); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

private struct NotificationSettingsView: View {
    @EnvironmentObject private var store: MailStore
    var body: some View {
        Form {
            Section {
                LabeledContent("Notifications", value: store.notifications)
                if let status = store.pushStatus { Text(status).font(.caption).foregroundStyle(.secondary) }
                Button("Enable new mail notifications") { Task { await store.enableNotifications() } }
                Button("Open iOS notification settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
            } footer: { Text("Receive an alert, sound, and unread badge for new inbox messages. Tapping an alert opens its conversation.") }
        }.navigationTitle("Notifications").navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .task { await store.notificationStatus() }
    }
}

private struct MailSortingSettingsView: View {
    @EnvironmentObject private var store: MailStore
    var body: some View {
        Form {
            Section {
                LabeledContent("Mail sorting", value: store.settings?.sortingConfigured == true ? "Configured" : "Not configured")
                if let model = store.settings?.sortingModel { LabeledContent("Model", value: model) }
                if let threshold = store.settings?.spamThreshold {
                    LabeledContent("Auto-spam cutoff", value: "\(Int((threshold * 100).rounded()))% confidence")
                }
                NavigationLink { SortingMemoryView() } label: { Label("Sorting memory", systemImage: "tag") }
            } footer: {
                Text("Edit tag and Spam guidance. Your label and Spam / Not spam corrections teach future sorting. Uncertain mail stays in the inbox; nothing is automatically deleted.")
            }
        }.navigationTitle("Mail sorting").navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
    }
}

struct SortingMemoryView: View {
    @EnvironmentObject private var store: MailStore
    @State private var memories: [SortingMemory] = []
    @State private var loading = false
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            if !loaded && loading {
                HStack { Spacer(); ProgressView("Loading sorting memory"); Spacer() }
            }
            if let error {
                Section {
                    Text(error).foregroundStyle(.red)
                    Button("Retry") { Task { await load() } }.disabled(loading)
                }
            }
            memorySection("Labels", items: memories.filter { $0.kind == "user" })
            memorySection("Spam detection", items: memories.filter(\.isSpam))
            if loaded && memories.filter({ $0.kind == "user" }).isEmpty {
                Section("Labels") {
                    NavigationLink("Create and manage labels") { LabelsView() }
                }
            }
            Section {
                Text("Guidance describes what belongs here. Explicit corrections provide examples; automatic sorting never teaches itself.")
                Text("New labels become eligible for automatic sorting when you add guidance or apply them to a conversation.")
            }.font(.footnote).foregroundStyle(.secondary)
        }
        .toolbar(.visible, for: .navigationBar)
        .navigationTitle("Sorting memory")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func memorySection(_ title: String, items: [SortingMemory]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { memory in
                    NavigationLink {
                        SortingMemoryEditor(memory: memory) { updated in
                            if let index = memories.firstIndex(where: { $0.id == updated.id }) {
                                memories[index] = updated
                            }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(memory.name)
                            Text(memory.guidance.isEmpty ? "Add sorting guidance" : memory.guidance)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            Text("\(memory.exampleCount) remembered examples").font(.caption2).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            }
        }
    }

    private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            memories = try await store.api.sortingMemories()
            loaded = true
            error = nil
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SortingMemoryEditor: View {
    @EnvironmentObject private var store: MailStore
    let onUpdate: (SortingMemory) -> Void
    @State private var memory: SortingMemory
    @State private var guidance: String
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @FocusState private var guidanceFocused: Bool

    init(memory: SortingMemory, onUpdate: @escaping (SortingMemory) -> Void) {
        self.onUpdate = onUpdate
        _memory = State(initialValue: memory)
        _guidance = State(initialValue: memory.guidance)
    }

    private var characterCount: Int { guidance.unicodeScalars.count }
    var body: some View {
        Form {
            Section {
                TextEditor(text: $guidance)
                    .focused($guidanceFocused)
                    .frame(minHeight: 160)
                    .accessibilityLabel("\(memory.name) sorting guidance")
                    .disabled(busy)
                HStack {
                    Text("\(characterCount) / 2,000 characters")
                        .font(.caption).foregroundStyle(characterCount > 2000 ? Color.red : Color.secondary)
                    Spacer()
                    if busy { ProgressView() }
                }
                Button("Save guidance") { Task { await save(clearExamples: false) } }
                    .disabled(busy || characterCount > 2000)
            } header: { Text("Sorting guidance") } footer: {
                Text(memory.isSpam
                    ? "Describe unwanted mail. Promotions and newsletters are legitimate unless your guidance or corrections say otherwise."
                    : "Describe the mail that belongs in this label. Your filters still take precedence.")
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let notice { Section { Text(notice).foregroundStyle(.secondary) }.accessibilityAddTraits(.updatesFrequently) }
            Section {
                LabeledContent("Remembered examples", value: String(memory.exampleCount))
                if memory.exampleCount > 0 {
                    Button("Clear remembered examples", role: .destructive) { Task { await save(clearExamples: true) } }
                        .disabled(busy || characterCount > 2000)
                }
            } header: { Text("Correction memory") } footer: {
                Text(memory.isSpam
                    ? "Spam and Not spam corrections are remembered separately. Clearing examples preserves your guidance."
                    : "Applying or removing labels teaches future sorting. Clearing examples preserves your guidance.")
            }
            if !memory.examples.isEmpty {
                Section(memory.isSpam ? "Recent Spam / Not spam examples" : "Recent examples") {
                    ForEach(Array(memory.examples.enumerated()), id: \.offset) { _, example in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(memory.isSpam
                                ? (example.included ? "Spam" : "Not spam")
                                : (example.included ? "Belongs here" : "Doesn’t belong here"))
                                .font(.caption.bold()).foregroundStyle(.secondary)
                            Text(example.subject.isEmpty ? "(no subject)" : example.subject).font(.subheadline)
                            Text(example.sender).font(.caption).foregroundStyle(.secondary)
                            Text(example.snippet).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }.padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(memory.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(busy)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done editing") { guidanceFocused = false }
            }
        }
    }

    private func save(clearExamples: Bool) async {
        guard !busy, characterCount <= 2000 else { return }
        guidanceFocused = false
        busy = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            try await store.api.saveSortingMemory(memory.id, guidance: guidance, clearExamples: clearExamples)
            // Reflect the successful write immediately, even if the following refresh fails.
            memory.guidance = guidance.trimmingCharacters(in: .whitespacesAndNewlines)
            guidance = memory.guidance
            if clearExamples { memory.exampleCount = 0; memory.examples = [] }
            onUpdate(memory)
            notice = clearExamples ? "Remembered examples cleared" : "Sorting guidance saved"
            do {
                let refreshed = try await store.api.sortingMemories()
                if let updated = refreshed.first(where: { $0.id == memory.id }) {
                    memory = updated
                    guidance = updated.guidance
                    onUpdate(updated)
                }
            } catch {
                self.error = "Your changes were saved, but memory could not be refreshed. \(error.localizedDescription)"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
