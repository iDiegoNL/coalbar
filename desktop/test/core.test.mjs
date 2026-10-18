import test from "node:test";
import assert from "node:assert/strict";
import {
  seconds,
  parseTiming,
  evaluate,
  shouldFlip,
  completed,
  clockText,
} from "../core/domain.mjs";
import { HAClient, baseURL, validateConfig } from "../core/client.mjs";
import { CoalModel } from "../core/model.mjs";
const start = 1800000000;
const state = (id, value, time = start, attributes = {}) => ({
  entity_id: id,
  state: value,
  last_changed: new Date(time * 1000).toISOString(),
  attributes,
});
const automation = (to, duration = 780, target = "switch.heater") => ({
  triggers: [{ trigger: "state", to, entity_id: target, for: duration }],
  conditions: [],
});
const config = {
  url: "http://example.local/",
  plug: "switch.heater",
  heatingAutomation: "automation.heat",
  reminderAutomation: "automation.fresh",
};
test("duration validation and rounding", () => {
  assert.equal(seconds("0:14:00"), 840);
  assert.equal(seconds({ hours: 1, milliseconds: 500 }), 3600.5);
  for (const bad of [
    true,
    Infinity,
    -1,
    "{{x}}",
    "00:99:00",
    { seconds: true },
    { unknown: 1 },
    { seconds: Infinity },
  ])
    assert.equal(seconds(bad), null);
  assert.equal(clockText(59.1), "01:00");
  assert.equal(clockText(-1), "00:00");
});
test("automation syntax, device registry targets and rejection", () => {
  assert.equal(parseTiming(automation("on"), "on").seconds, 780);
  assert.equal(
    parseTiming(
      {
        trigger: {
          platform: "state",
          to: "off",
          entity_id: "switch.heater",
          for: "01:00:00",
        },
      },
      "off",
    ).seconds,
    3600,
  );
  assert.equal(
    parseTiming(
      {
        triggers: [
          {
            trigger: "device",
            domain: "switch",
            type: "turned_on",
            entity_id: "registry-id",
            for: { minutes: 13 },
          },
        ],
      },
      "on",
    ).target,
    "registry-id",
  );
  for (const bad of [
    { ...automation("on"), use_blueprint: {} },
    { ...automation("on"), conditions: [{}] },
    { ...automation("on"), triggers: [] },
    automation("off"),
    automation("on", "{{x}}"),
    automation("on", 0),
    automation("on", 780, ["switch.heater"]),
    { triggers: [{ ...automation("on").triggers[0], enabled: false }] },
    { triggers: [{ ...automation("on").triggers[0], attribute: "x" }] },
  ])
    assert.throws(() => parseTiming(bad, "on"));
});
test("heating, halfway, overdue, paused, off and unknown", () => {
  const plug = state("switch.heater", "on");
  assert.equal(evaluate(plug, null, start + 120, 780).remaining, 660);
  assert.ok(shouldFlip(evaluate(plug, null, start + 390, 780)));
  assert.equal(evaluate(plug, null, start + 800, 780).phase, "overdue");
  assert.equal(evaluate(plug, null, start - 1, 780).phase, "unknown");
  assert.equal(evaluate(plug, null, start, null).phase, "unknown");
  const timer = state("timer.heat", "active", start, {
    duration: "00:14:00",
    finishes_at: new Date((start + 500) * 1000).toISOString(),
  });
  assert.equal(evaluate(plug, timer, start, 780).remaining, 500);
  assert.equal(evaluate({ ...plug, state: "off" }, timer, start).phase, "off");
  const paused = evaluate(
    plug,
    {
      ...timer,
      state: "paused",
      attributes: { duration: "00:14:00", remaining: "00:05:00" },
    },
    start,
  );
  assert.equal(paused.remaining, 300);
  assert.equal(shouldFlip(paused), false);
  assert.equal(evaluate(undefined, null, start).phase, "unknown");
});
test("completion boundaries exclude early manual shutoff", () => {
  assert.equal(completed(start, undefined), false);
  assert.equal(completed(start, start + 6), false);
  assert.ok(completed(start, start + 5));
  assert.ok(completed(start, start - 299));
  assert.equal(completed(start, start - 300), false);
});
test("URL and configuration validation", () => {
  assert.equal(
    baseURL("http://example.local/ha").href,
    "http://example.local/ha/",
  );
  for (const bad of [
    "file:///etc/passwd",
    "https://token@example.com",
    "https://example.com?token=x",
    "https://example.com/#x",
  ])
    assert.throws(() => baseURL(bad));
  assert.equal(validateConfig(config).plug, "switch.heater");
  assert.throws(() => validateConfig({ ...config, plug: "light.heater" }));
});
test("client refuses redirect, validates payload, and limits requests to GET", async () => {
  let request;
  const client = new HAClient(async (url, options) => {
    request = { url, options };
    return { status: 302 };
  });
  await assert.rejects(client.states(config, "secret"), /Redirect refused/);
  assert.equal(request.options.redirect, "manual");
  assert.equal(request.options.method, undefined);
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.equal(request.url.pathname, "/api/states");
  await assert.rejects(
    new HAClient(async () => ({ status: 200, json: async () => ({}) })).states(
      config,
      "secret",
    ),
    /states/,
  );
});
function fixture(memory = {}) {
  let now = start,
    plug = "on",
    changed = start,
    enabled = true;
  const notifications = [];
  const client = {
    states: async () => [
      state("switch.heater", plug, changed),
      state("automation.heat", enabled ? "on" : "off", start, { id: "heat" }),
      state("automation.fresh", "on", start, { id: "fresh" }),
    ],
    automation: async (_c, _t, id) =>
      automation(id === "heat" ? "on" : "off", id === "heat" ? 780 : 3600),
  };
  const model = new CoalModel({
    client,
    config,
    token: "secret",
    memory,
    notify: (t) => notifications.push(t),
    now: () => now,
  });
  return {
    model,
    notifications,
    client,
    time: (n) => {
      now = n;
    },
    off: (n) => {
      plug = "off";
      changed = n;
      now = n;
    },
    disable: () => {
      enabled = false;
    },
  };
}
test("flip deduplication, dismissal, completed and fresh reminders survive restart", async () => {
  const memory = {},
    f = fixture(memory);
  await f.model.refresh();
  f.time(start + 390);
  await f.model.refresh();
  assert.deepEqual(f.notifications, ["flip"]);
  f.model.dismiss();
  f.model.tick();
  assert.equal(f.model.notice, null);
  f.off(start + 780);
  await f.model.refresh();
  assert.deepEqual(f.notifications, ["flip", "ready"]);
  const restarted = fixture(memory);
  restarted.off(start + 780);
  await restarted.model.refresh();
  assert.deepEqual(restarted.notifications, []);
  f.time(start + 4380);
  await f.model.refresh();
  assert.deepEqual(f.notifications, ["flip", "ready", "fresh"]);
});
test("manual off, stale snapshots and disabled automation suppress alerts", async () => {
  const f = fixture();
  await f.model.refresh();
  f.off(start + 100);
  await f.model.refresh();
  assert.deepEqual(f.notifications, []);
  const stale = fixture();
  await stale.model.refresh();
  stale.time(start + 390);
  stale.model.tick();
  assert.equal(stale.model.reachable, false);
  assert.deepEqual(stale.notifications, []);
  const disabled = fixture();
  await disabled.model.refresh();
  disabled.disable();
  disabled.off(start + 780);
  await disabled.model.refresh();
  assert.deepEqual(disabled.notifications, []);
});
test("demo never polls or sends system notifications", async () => {
  const f = fixture();
  let calls = 0;
  f.client.states = async () => {
    calls++;
    throw Error("unexpected");
  };
  f.model.setDemo(true);
  await f.model.refresh();
  f.model.preview("fresh");
  f.model.tick();
  assert.equal(calls, 0);
  assert.deepEqual(f.notifications, []);
  assert.equal(f.model.notice, "fresh");
});
test("late response cannot overwrite a new configuration or demo", async () => {
  const f = fixture();
  let resolve;
  f.client.states = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = f.model.refresh();
  f.model.setDemo(true);
  resolve([]);
  await pending;
  assert.equal(f.model.demo, true);
  assert.equal(f.model.reachable, false);
});
test("timing errors discard cached countdowns and notices", async () => {
  const f = fixture();
  await f.model.refresh();
  f.time(start + 390);
  await f.model.refresh();
  assert.equal(f.model.notice, "flip");
  f.client.automation = async () => automation("on", "{{x}}");
  f.time(start + 451);
  await f.model.refresh();
  assert.equal(f.model.reading.phase, "unknown");
  assert.equal(f.model.notice, null);
});

test("slow timing requests cannot turn an old state snapshot into fresh data", async () => {
  const f = fixture();
  f.client.automation = async (_config, _token, id) => {
    f.time(start + 25);
    return automation(id === "heat" ? "on" : "off", id === "heat" ? 780 : 3600);
  };
  await f.model.refresh();
  assert.equal(f.model.view.reachable, false);
  assert.equal(f.model.view.reading.phase, "unknown");
  assert.deepEqual(f.notifications, []);
});

test("reminder storage and notification failures do not crash the timer", async () => {
  const f = fixture();
  f.model.persist = () => {
    throw Error("disk full");
  };
  f.model.notify = () => {
    throw Error("notification daemon stopped");
  };
  await f.model.refresh();
  f.time(start + 390);
  await f.model.refresh();
  assert.equal(f.model.view.reachable, true);
  assert.equal(f.model.view.notice, "flip");
  assert.match(f.model.view.status, /history could not be saved/);
  assert.match(f.model.view.status, /notification failed/);
  assert.doesNotThrow(() => f.model.tick());
});
