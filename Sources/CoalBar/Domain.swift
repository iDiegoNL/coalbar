import Foundation

struct HAState: Decodable {
    let entity_id: String
    let state: String
    let attributes: Attributes
    let last_changed: String

    struct Attributes: Decodable {
        var id: String?
        var friendly_name: String?
        var duration: String?
        var remaining: String?
        var finishes_at: String?
    }

    var changedAt: Date? { Self.date(last_changed) }
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    static func seconds(_ text: String?) -> TimeInterval? {
        guard let text else { return nil }
        let parts = text.split(separator: ":").compactMap { Double($0) }
        guard parts.count == 3 else { return nil }
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
}

struct Configuration: Codable, Equatable {
    var url = ""
    var plug = ""
    var timer = ""
    var refreshTimer = ""
    var reminderMinutes = 60
    // Optional storage preserves configurations saved before estimated timers existed.
    var heatingMinutes: Int? = 13
    var heatingAutomation: String?
    var reminderAutomation: String?
    static func load() -> Self {
        guard let data = UserDefaults.standard.data(forKey: "configuration"),
              let config = try? JSONDecoder().decode(Self.self, from: data) else { return Self() }
        return config
    }
    func save() { UserDefaults.standard.set(try? JSONEncoder().encode(self), forKey: "configuration") }
}

struct HeaterReading {
    enum Phase: Equatable { case off, heating, paused, overdue, unknown }
    var phase: Phase
    var remaining: TimeInterval?
    var duration: TimeInterval?
    var cycleID: String?
    var offDate: Date?

    static func evaluate(plug: HAState?, timer: HAState?, now: Date, fallbackDuration: TimeInterval? = nil) -> Self {
        guard let plug, ["on", "off"].contains(plug.state) else {
            return Self(phase: .unknown)
        }
        guard plug.state == "on" else { return Self(phase: .off, offDate: plug.changedAt) }
        guard let timer else {
            guard let duration = fallbackDuration, duration > 0, let start = plug.changedAt,
                  start <= now else { return Self(phase: .unknown) }
            let end = start.addingTimeInterval(duration)
            let remaining = end.timeIntervalSince(now)
            return Self(phase: remaining > 0 ? .heating : .overdue,
                        remaining: max(0, remaining), duration: duration,
                        cycleID: ISO8601DateFormatter().string(from: end))
        }
        let duration = HAState.seconds(timer.attributes.duration)
        if timer.state == "paused" {
            return Self(phase: .paused, remaining: HAState.seconds(timer.attributes.remaining), duration: duration)
        }
        guard timer.state == "active", let end = HAState.date(timer.attributes.finishes_at) else {
            return Self(phase: .unknown)
        }
        let remaining = end.timeIntervalSince(now)
        return Self(phase: remaining > 0 ? .heating : .overdue, remaining: max(0, remaining),
                    duration: duration, cycleID: timer.attributes.finishes_at)
    }

    var shouldFlip: Bool {
        phase == .heating && (remaining ?? .infinity) <= (duration ?? 0) / 2
    }
}

func clockText(_ seconds: TimeInterval) -> String {
    let value = max(0, Int(ceil(seconds)))
    return String(format: "%02d:%02d", value / 60, value % 60)
}

// Early manual switch-off must not be announced as a finished heating cycle.
enum ReminderRules {
    static func completed(off: Date, expectedEnd: Date?) -> Bool {
        guard let expectedEnd else { return false }
        let delay = off.timeIntervalSince(expectedEnd)
        return delay >= -5 && delay < 300
    }
}
