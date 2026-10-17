import AppKit
import Combine
import UserNotifications

@MainActor
final class CoalModel: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published var config = Configuration.load()
    @Published var entities: [HAState] = []
    @Published var reading = HeaterReading(phase: .unknown)
    @Published var reachable = false
    @Published var demo = false
    @Published var panelVisible = false
    @Published var status = "Connecting to Home Assistant…"
    @Published var notice: Notice?
    @Published var now = Date()
    @Published var lastUpdated: Date?
    @Published var notificationStatus = "Checking notification permission…"
    @Published var notificationsEnabled: Bool?
    @Published var isChecking = false
    @Published var timingSummary = "Select your two Home Assistant automations."
    private var heatingTiming: AutomationTiming?
    private var reminderTiming: AutomationTiming?
    private var timingsUpdated: Date?
    var visibilityChanged: (() -> Void)?
    var showPreview: (() -> Void)?
    private let client = HAClient()
    private var token = TokenStore.read()
    private var polling: Task<Void, Never>?
    private var ticker: Timer?
    private var snapshot: [String: HAState] = [:]
    private var seen = Set(UserDefaults.standard.stringArray(forKey: "seenReminders") ?? [])
    private var demoEnd = Date()
    private var demoStage: Notice?
    private var demoOffDate: Date?
    private var generation = 0

    enum Notice: String {
        case flip = "Time to flip the coals"
        case ready = "Heater is off · collect your coals"
        case fresh = "Ready for fresh coals?"
        var icon: String {
            switch self { case .flip: return "arrow.triangle.2.circlepath"; case .ready: return "checkmark.circle.fill"; case .fresh: return "flame.circle.fill" }
        }
    }

    override init() {
        super.init()
        if config.url.isEmpty { config.url = "http://homeassistant.local:8123/" }
        UNUserNotificationCenter.current().delegate = self
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        startPolling()
        Task { await refreshNotificationSettings() }
    }

    var configured: Bool { !config.plug.isEmpty && !token.isEmpty }
    var visible: Bool { demo || (reachable && configured) }
    var menuTitle: String {
        if let notice { return notice == .flip ? "Flip · \(clockText(reading.remaining ?? 0))" : notice == .ready ? "Ready" : "New coals?" }
        switch reading.phase {
        case .heating: return clockText(reading.remaining ?? 0)
        case .paused: return "Paused"
        case .overdue: return "Check heater"
        case .off: return ""
        case .unknown: return "Check timer"
        }
    }
    var headline: String {
        if let notice { return notice.rawValue }
        switch reading.phase {
        case .heating: return "Coals are warming up"
        case .paused: return "Countdown paused"
        case .overdue: return "Timer ended · heater still on"
        case .off: return "Heater is off"
        case .unknown: return "Heater or timer unavailable"
        }
    }
    private var deadlineKey: String { "heatDeadline|\(config.url)|\(config.plug)|\(config.timer)" }
    var refreshDate: Date? {
        if demo { return demoOffDate?.addingTimeInterval(3600) }
        guard reading.phase == .off, let off = reading.offDate, let timing = reminderTiming,
              snapshot[config.reminderAutomation ?? ""]?.state == "on" else { return nil }
        return off.addingTimeInterval(timing.seconds)
    }

    private func readTimings(states: [HAState]) async throws -> (AutomationTiming, AutomationTiming) {
        guard let heat = states.first(where: { $0.entity_id == config.heatingAutomation }),
              let reminder = states.first(where: { $0.entity_id == config.reminderAutomation }),
              let heatID = heat.attributes.id, let reminderID = reminder.attributes.id else {
            throw AppFailure(message: "Select both automations in Settings, then Save & connect.")
        }
        let heatData = try await client.automation(configuration: config, token: token, id: heatID)
        let reminderData = try await client.automation(configuration: config, token: token, id: reminderID)
        let heating = try AutomationTiming.parse(heatData, expectedState: "on")
        let fresh = try AutomationTiming.parse(reminderData, expectedState: "off")
        guard heating.target == fresh.target else {
            throw AppFailure(message: "The selected automations must monitor the same switch.")
        }
        if heating.target.contains("."), heating.target != config.plug {
            throw AppFailure(message: "The selected automations monitor a different smart plug.")
        }
        return (heating, fresh)
    }

    func save(_ configuration: Configuration, newToken: String) throws {
        _ = try HAClient.baseURL(configuration.url)
        guard configuration.plug.hasPrefix("switch.") || configuration.plug.hasPrefix("input_boolean.") else {
            throw AppFailure(message: "Choose the heater’s switch entity.")
        }
        guard configuration.heatingAutomation?.hasPrefix("automation.") == true,
              configuration.reminderAutomation?.hasPrefix("automation.") == true else {
            throw AppFailure(message: "Choose the heating and fresh-coal automations.")
        }
        guard !newToken.isEmpty else { throw AppFailure(message: "Enter a Home Assistant access token.") }
        try TokenStore.save(newToken)
        generation += 1
        config = configuration
        config.timer = ""
        config.refreshTimer = ""
        heatingTiming = nil
        reminderTiming = nil
        timingsUpdated = nil
        config.save()
        token = newToken
        snapshot = [:]
        notice = nil
        demo = false
        reachable = false
        visibilityChanged?()
        startPolling()
    }
    func savedToken() -> String { token }

    func discover(configuration: Configuration, token: String) async throws {
        entities = try await client.states(configuration: configuration, token: token)
            .sorted { ($0.attributes.friendly_name ?? $0.entity_id) < ($1.attributes.friendly_name ?? $1.entity_id) }
    }

    func startPolling() {
        polling?.cancel()
        polling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refresh()
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }

    func refresh() async {
        guard !demo, !token.isEmpty else {
            if !demo { status = "Open Settings to connect Home Assistant." }
            return
        }
        let version = generation
        isChecking = true
        defer { isChecking = false }
        do {
            let states = try await client.states(configuration: config, token: token)
            guard version == generation, !Task.isCancelled, !demo else { return }
            snapshot = Dictionary(states.map { ($0.entity_id, $0) }, uniquingKeysWith: { _, new in new })
            reachable = true
            lastUpdated = Date()
            entities = states.sorted { ($0.attributes.friendly_name ?? $0.entity_id) < ($1.attributes.friendly_name ?? $1.entity_id) }
            if timingsUpdated == nil || Date().timeIntervalSince(timingsUpdated!) >= 60 {
                do {
                    let timings = try await readTimings(states: states)
                    guard version == generation, !Task.isCancelled else { return }
                    heatingTiming = timings.0
                    reminderTiming = timings.1
                    timingsUpdated = Date()
                    timingSummary = "Heating \(clockText(timings.0.seconds)) · Flip at \(clockText(timings.0.seconds / 2)) · Fresh coals after \(clockText(timings.1.seconds))"
                } catch {
                    guard version == generation, !Task.isCancelled else { return }
                    heatingTiming = nil
                    reminderTiming = nil
                    timingsUpdated = nil
                    timingSummary = error.localizedDescription
                    status = error.localizedDescription
                    reading = HeaterReading(phase: .unknown)
                    notice = nil
                    visibilityChanged?()
                    return
                }
            }
            status = "Connected · timings synced from Home Assistant"
            lastUpdated = Date()
            tick()
        } catch {
            guard version == generation, !Task.isCancelled else { return }
            reachable = false
            status = error.localizedDescription
            visibilityChanged?()
        }
    }

    private func tick() {
        now = Date()
        if demo {
            if demoStage == .ready || demoStage == .fresh {
                reading = HeaterReading(phase: .off, offDate: demoOffDate)
            } else {
                reading = HeaterReading(phase: .heating, remaining: max(0, demoEnd.timeIntervalSince(now)), duration: 780, cycleID: "demo")
            }
            visibilityChanged?()
            return
        }
        // Never show a stale countdown or issue reminders after sleep/network loss.
        guard reachable, let lastUpdated, now.timeIntervalSince(lastUpdated) < 20 else {
            reachable = false
            visibilityChanged?()
            return
        }
        guard let heating = heatingTiming, reminderTiming != nil else {
            reading = HeaterReading(phase: .unknown)
            notice = nil
            visibilityChanged?()
            return
        }
        let previous = reading
        let heatingEnabled = snapshot[config.heatingAutomation ?? ""]?.state == "on"
        reading = HeaterReading.evaluate(plug: snapshot[config.plug], timer: nil, now: now,
            fallbackDuration: heatingEnabled ? heating.seconds : nil)
        if reading.phase == .paused { UserDefaults.standard.removeObject(forKey: deadlineKey) }
        if reading.phase == .heating {
            if let end = HAState.date(reading.cycleID) { UserDefaults.standard.set(end, forKey: deadlineKey) }
            if previous.cycleID != reading.cycleID { notice = nil }
            if reading.shouldFlip, let cycle = reading.cycleID { remind(.flip, id: "flip-\(cycle)") }
        } else if reading.phase == .off {
            if notice == .flip { notice = nil }
            if let off = reading.offDate {
                let age = now.timeIntervalSince(off)
                // Only call a batch ready when switch-off follows the heating deadline.
                let end = UserDefaults.standard.object(forKey: deadlineKey) as? Date
                if age >= 0 && age < 300 && ReminderRules.completed(off: off, expectedEnd: end) {
                    remind(.ready, id: "off-\(off.timeIntervalSince1970)")
                }
                if let due = refreshDate, now >= due, now.timeIntervalSince(due) < 7200 {
                    remind(.fresh, id: "fresh-\(due.timeIntervalSince1970)")
                }

            }
        } else { notice = nil }
        visibilityChanged?()
    }

    private func remind(_ type: Notice, id: String) {
        let key = "\(config.url)|\(config.plug)|\(id)"
        guard !seen.contains(key) else { return }
        seen.insert(key)
        if seen.count > 500 { seen = [key] }
        UserDefaults.standard.set(Array(seen), forKey: "seenReminders")
        notice = type
        let content = UNMutableNotificationContent()
        content.title = type.rawValue
        switch type {
        case .flip: content.body = "Halfway through heating. Turn the coals over."
        case .ready: content.body = "Home Assistant reports the smart plug is off. Your coals are ready to collect."
        case .fresh: content.body = "It’s time to consider another batch of coals."
        }
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: key, content: content, trigger: nil))
    }

    func refreshNotificationSettings() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let enabled = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        notificationsEnabled = enabled
        notificationStatus = enabled ? "Notifications enabled." :
            settings.authorizationStatus == .denied
                ? "Notifications are disabled. Enable CoalBar in System Settings → Notifications."
                : "Notifications have not been enabled."
    }

    func enableNotifications() async {
        do {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            await refreshNotificationSettings()
        } catch { notificationStatus = error.localizedDescription }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
        willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }

    func dismissNotice() { notice = nil; visibilityChanged?() }
    func setDemo(_ enabled: Bool) {
        generation += 1
        demo = enabled
        demoStage = nil
        demoOffDate = nil
        notice = nil
        demoEnd = Date().addingTimeInterval(8 * 60 + 42)
        if !enabled { reachable = false; startPolling() }
        tick()
        visibilityChanged?()
        if enabled { showPreview?() }
    }
    func preview(_ type: Notice) {
        guard demo else { return }
        demoStage = type
        notice = type
        switch type {
        case .flip:
            demoOffDate = nil
            demoEnd = Date().addingTimeInterval(390)
        case .ready:
            demoOffDate = Date()
        case .fresh:
            demoOffDate = Date().addingTimeInterval(-3600)
        }
        tick()
    }
}
