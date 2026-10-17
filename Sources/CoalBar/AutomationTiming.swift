import Foundation

struct AutomationTiming: Equatable {
    let seconds: TimeInterval
    let target: String

    static func parse(_ data: Data, expectedState: String) throws -> Self {
        guard let config = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              config["use_blueprint"] == nil else {
            throw AppFailure(message: "This automation’s timing cannot be read directly.")
        }
        let raw = config["triggers"] ?? config["trigger"]
        let triggers = raw as? [[String: Any]] ?? (raw as? [String: Any]).map { [$0] } ?? []
        guard triggers.count == 1, let trigger = triggers.first,
              (trigger["enabled"] as? Bool) != false else {
            throw AppFailure(message: "Choose an automation with one enabled on/off trigger and a fixed duration.")
        }
        let kind = trigger["trigger"] as? String ?? trigger["platform"] as? String
        let matches = (kind == "device" && trigger["domain"] as? String == "switch" &&
                       trigger["type"] as? String == "turned_\(expectedState)") ||
                      (kind == "state" && trigger["to"] as? String == expectedState && trigger["attribute"] == nil)
        guard matches, let target = trigger["entity_id"] as? String,
              let seconds = duration(trigger["for"]), seconds > 0 else {
            throw AppFailure(message: "This automation needs a fixed ‘\(expectedState) for’ duration. Templates and multiple triggers are not supported.")
        }
        let conditions = config["conditions"] ?? config["condition"]
        if let conditions, !(conditions is NSNull) {
            guard let list = conditions as? [Any], list.isEmpty else {
                throw AppFailure(message: "Conditional automations cannot provide a reliable countdown.")
            }
        }
        return Self(seconds: seconds, target: target)
    }
    private static func duration(_ value: Any?) -> TimeInterval? {
        if let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite { return number.doubleValue }
        if let text = value as? String {
            if let seconds = Double(text), seconds.isFinite { return seconds }
            return HAState.seconds(text)
        }
        guard let parts = value as? [String: Any], !parts.isEmpty else { return nil }
        let units: [String: Double] = ["days": 86400, "hours": 3600, "minutes": 60, "seconds": 1, "milliseconds": 0.001]
        var seconds = 0.0
        for (key, value) in parts {
            guard let scale = units[key], let number = value as? NSNumber,
                  CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue >= 0 else { return nil }
            seconds += number.doubleValue * scale
        }
        return seconds.isFinite ? seconds : nil
    }
}

import CoreFoundation
