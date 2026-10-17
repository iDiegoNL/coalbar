import XCTest
@testable import CoalBar

final class CoalBarTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    func state(_ id: String, _ value: String, duration: String? = nil, remaining: String? = nil, end: Date? = nil) -> HAState {
        HAState(entity_id: id, state: value, attributes: .init(duration: duration, remaining: remaining,
            finishes_at: end.map { ISO8601DateFormatter().string(from: $0) }), last_changed: ISO8601DateFormatter().string(from: now))
    }
    func testHeatingUsesAuthoritativeDeadline() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"),
            timer: state("timer.heater", "active", duration: "0:14:00", end: now.addingTimeInterval(500)), now: now)
        XCTAssertEqual(result.phase, .heating)
        XCTAssertEqual(result.remaining, 500)
        XCTAssertFalse(result.shouldFlip)
    }
    func testHalfwayIncludesExactBoundary() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"),
            timer: state("timer.heater", "active", duration: "0:14:00", end: now.addingTimeInterval(420)), now: now)
        XCTAssertTrue(result.shouldFlip)
    }
    func testPausedCountdownDoesNotAdvanceOrNotify() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"),
            timer: state("timer.heater", "paused", duration: "0:14:00", remaining: "0:05:00"), now: now)
        XCTAssertEqual(result.phase, .paused)
        XCTAssertEqual(result.remaining, 300)
        XCTAssertFalse(result.shouldFlip)
    }
    func testExpiredTimerDoesNotClaimPlugIsOff() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"),
            timer: state("timer.heater", "active", duration: "0:14:00", end: now.addingTimeInterval(-1)), now: now)
        XCTAssertEqual(result.phase, .overdue)
        XCTAssertEqual(result.remaining, 0)
        XCTAssertFalse(result.shouldFlip)
    }
    func testUnknownEntitiesDoNotInventCountdown() {
        XCTAssertEqual(HeaterReading.evaluate(plug: nil, timer: nil, now: now).phase, .unknown)
        XCTAssertEqual(HeaterReading.evaluate(plug: state("switch.heater", "unavailable"), timer: nil, now: now).phase, .unknown)
        XCTAssertEqual(HeaterReading.evaluate(plug: state("switch.heater", "on"), timer: state("timer.heater", "idle"), now: now).phase, .unknown)
    }
    func testOffOverridesTimer() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "off"),
            timer: state("timer.heater", "active", end: now.addingTimeInterval(30)), now: now)
        XCTAssertEqual(result.phase, .off)
        XCTAssertEqual(result.offDate, now)
    }
    func testManualOffAndUnknownDeadlinesAreNotCompletion() {
        XCTAssertFalse(ReminderRules.completed(off: now, expectedEnd: now.addingTimeInterval(60)))
        XCTAssertFalse(ReminderRules.completed(off: now, expectedEnd: nil))
        XCTAssertTrue(ReminderRules.completed(off: now, expectedEnd: now))
        XCTAssertTrue(ReminderRules.completed(off: now, expectedEnd: now.addingTimeInterval(-10)))
        XCTAssertFalse(ReminderRules.completed(off: now, expectedEnd: now.addingTimeInterval(-3600)))
    }
    func testParsingAndRounding() {
        XCTAssertEqual(HAState.seconds("0:14:00"), 840)
        XCTAssertNil(HAState.seconds("invalid"))
        XCTAssertNotNil(HAState.date("2026-10-17T12:00:00.123456+00:00"))
        XCTAssertEqual(clockText(59.1), "01:00")
        XCTAssertEqual(clockText(-1), "00:00")
    }
    func testEstimatedTimerUsesPlugSwitchOnTime() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"), timer: nil,
            now: now.addingTimeInterval(120), fallbackDuration: 780)
        XCTAssertEqual(result.phase, .heating)
        XCTAssertEqual(result.remaining, 660)
        XCTAssertEqual(result.duration, 780)
        XCTAssertFalse(result.shouldFlip)
        let halfway = HeaterReading.evaluate(plug: state("switch.heater", "on"), timer: nil,
            now: now.addingTimeInterval(390), fallbackDuration: 780)
        XCTAssertTrue(halfway.shouldFlip)
    }
    func testEstimatedExpiryStillRequiresPlugOff() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"), timer: nil,
            now: now.addingTimeInterval(790), fallbackDuration: 780)
        XCTAssertEqual(result.phase, .overdue)
        XCTAssertEqual(result.remaining, 0)
    }
    func testRealTimerTakesPriorityOverEstimate() {
        let result = HeaterReading.evaluate(plug: state("switch.heater", "on"),
            timer: state("timer.heater", "active", duration: "0:13:00", end: now.addingTimeInterval(500)),
            now: now, fallbackDuration: 840)
        XCTAssertEqual(result.remaining, 500)
        XCTAssertEqual(result.duration, 780)
    }
    func testExistingConfigurationStillDecodes() throws {
        let data = Data(#"{"url":"http://example.local","plug":"switch.heater","timer":"timer.heater","refreshTimer":"","reminderMinutes":60}"#.utf8)
        let config = try JSONDecoder().decode(Configuration.self, from: data)
        XCTAssertEqual(config.plug, "switch.heater")
        XCTAssertNil(config.heatingMinutes)
    }
    func testAutomationTimingsMatchUserAutomations() throws {
        let heating = Data(#"{"triggers":[{"trigger":"device","domain":"switch","type":"turned_on","entity_id":"registry-id","for":{"hours":0,"minutes":13,"seconds":0}}],"conditions":[]}"#.utf8)
        let fresh = Data(#"{"triggers":[{"trigger":"device","domain":"switch","type":"turned_off","entity_id":"registry-id","for":{"hours":1,"minutes":0,"seconds":0}}],"conditions":[]}"#.utf8)
        XCTAssertEqual(try AutomationTiming.parse(heating, expectedState: "on").seconds, 780)
        XCTAssertEqual(try AutomationTiming.parse(fresh, expectedState: "off").seconds, 3600)
        XCTAssertThrowsError(try AutomationTiming.parse(fresh, expectedState: "on"))
    }
    func testAutomationTemplatesAndConditionsAreRejected() {
        let template = Data(#"{"triggers":[{"trigger":"state","to":"on","entity_id":"switch.heater","for":"{{ duration }}"}]}"#.utf8)
        let conditional = Data(#"{"triggers":[{"trigger":"state","to":"on","entity_id":"switch.heater","for":780}],"conditions":[{"condition":"state"}]}"#.utf8)
        XCTAssertThrowsError(try AutomationTiming.parse(template, expectedState: "on"))
        XCTAssertThrowsError(try AutomationTiming.parse(conditional, expectedState: "on"))
    }
    func testLegacyStateAutomationDuration() throws {
        let data = Data(#"{"trigger":{"platform":"state","to":"on","entity_id":"switch.heater","for":"00:13:00"},"condition":[]}"#.utf8)
        XCTAssertEqual(try AutomationTiming.parse(data, expectedState: "on").seconds, 780)
    }
    func testURLValidation() throws {
        XCTAssertEqual(try HAClient.baseURL("http://192.0.2.10:8123/").host, "192.0.2.10")
        XCTAssertThrowsError(try HAClient.baseURL("file:///etc/passwd"))
        XCTAssertThrowsError(try HAClient.baseURL("https://token@example.com"))
        XCTAssertThrowsError(try HAClient.baseURL("https://example.com?token=secret"))
    }
}
