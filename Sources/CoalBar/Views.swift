import SwiftUI
import ServiceManagement

struct SettingsView: View {
    @ObservedObject var model: CoalModel
    @State private var draft: Configuration
    @State private var token: String
    @State private var message = ""
    @State private var loading = false
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    init(model: CoalModel) {
        self.model = model
        _draft = State(initialValue: model.config)
        _token = State(initialValue: model.savedToken())
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: "flame.fill").font(.largeTitle).foregroundStyle(.orange)
                VStack(alignment: .leading, spacing: 3) {
                    Text("CoalBar").font(.title.bold())
                    Text("A little reminder for a better session.").foregroundStyle(.secondary)
                }
                Spacer()
                Button(model.demo ? "Stop demo" : "Try demo") { model.setDemo(!model.demo) }
            }
            Form {
                Section("Home Assistant") {
                    TextField("Server URL", text: $draft.url)
                    SecureField("Long-lived access token", text: $token)
                    Text("Create a token in your Home Assistant profile → Security → Long-lived access tokens. It is stored in macOS Keychain.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button(loading ? "Connecting…" : "Connect & find entities") {
                        loading = true
                        Task {
                            do {
                                try await model.discover(configuration: draft, token: token)
                                message = "Connected. Select your heater and automations below."
                            } catch { message = error.localizedDescription }
                            loading = false
                        }
                    }.disabled(loading)
                }
                Section("Your heater") {
                    entityField("Smart plug", selection: $draft.plug, domains: ["switch.", "input_boolean."])
                    entityField("Heating automation", selection: Binding(
                        get: { draft.heatingAutomation ?? "" }, set: { draft.heatingAutomation = $0 }), domains: ["automation."])
                    entityField("Fresh-coal automation", selection: Binding(
                        get: { draft.reminderAutomation ?? "" }, set: { draft.reminderAutomation = $0 }), domains: ["automation."])
                    Text(model.timingSummary).font(.callout).foregroundStyle(.secondary)
                    Text("Durations come directly from these automations and refresh every minute. Flip reminders happen halfway through heating. Home Assistant controls the heater.")
                        .font(.caption).foregroundStyle(.secondary)

                }
                Section("Mac preferences") {
                    if model.notificationsEnabled == false {
                        Button("Enable notifications") { Task { await model.enableNotifications() } }
                    }
                    Text(model.notificationStatus).font(.caption).foregroundStyle(.secondary)
                    Toggle("Open at login", isOn: $launchAtLogin).onChange(of: launchAtLogin) { _, enabled in
                        do {
                            if enabled { try SMAppService.mainApp.register() }
                            else { try SMAppService.mainApp.unregister() }
                        } catch {
                            message = "Login setting could not be changed: \(error.localizedDescription)"
                            launchAtLogin = SMAppService.mainApp.status == .enabled
                        }
                    }
                    Text("The menu bar item disappears when Home Assistant is unreachable and returns when connected. Reopen CoalBar to access these settings anytime.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped)
            if !message.isEmpty { Text(message).font(.callout).foregroundStyle(.secondary).textSelection(.enabled) }
            HStack {
                Circle().fill(model.reachable ? Color.green : Color.secondary).frame(width: 7, height: 7)
                Text(model.status).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                Spacer()
                Button("Save & connect") {
                    do {
                        draft.url = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
                        draft.plug = draft.plug.trimmingCharacters(in: .whitespacesAndNewlines)
                        draft.heatingAutomation = draft.heatingAutomation?.trimmingCharacters(in: .whitespacesAndNewlines)
                        draft.reminderAutomation = draft.reminderAutomation?.trimmingCharacters(in: .whitespacesAndNewlines)
                        try model.save(draft, newToken: token.trimmingCharacters(in: .whitespacesAndNewlines))
                        message = "Settings saved. You can close this window."
                    } catch { message = error.localizedDescription }
                }.buttonStyle(.borderedProminent)
            }
        }.padding(24).frame(width: 620, height: 740)
        .task { await model.refreshNotificationSettings() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.refreshNotificationSettings() }
        }
    }

    @ViewBuilder private func entityField(_ title: String, selection: Binding<String>, domains: [String]) -> some View {
        if model.entities.isEmpty { TextField(title, text: selection) }
        else {
            Picker(title, selection: selection) {
                Text("None selected").tag("")
                if !selection.wrappedValue.isEmpty && !model.entities.contains(where: { $0.entity_id == selection.wrappedValue }) {
                    Text(selection.wrappedValue).tag(selection.wrappedValue)
                }
                ForEach(model.entities.filter { entity in domains.contains { entity.entity_id.hasPrefix($0) } }, id: \.entity_id) { entity in
                    Text("\(entity.attributes.friendly_name ?? entity.entity_id) — \(entity.entity_id)").tag(entity.entity_id)
                }
            }
        }
    }
}
