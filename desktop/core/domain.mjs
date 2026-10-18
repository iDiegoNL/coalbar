export function seconds(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    if (/^\d+(\.\d+)?$/.test(value)) return seconds(Number(value));
    if (/^\d+:\d{1,2}:\d{1,2}(\.\d+)?$/.test(value)) {
      const [h, m, s] = value.split(":").map(Number);
      return m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
    }
    return null;
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    !Object.keys(value).length
  )
    return null;
  const units = {
    days: 86400,
    hours: 3600,
    minutes: 60,
    seconds: 1,
    milliseconds: 0.001,
  };
  let total = 0;
  for (const [key, n] of Object.entries(value)) {
    if (
      !Object.hasOwn(units, key) ||
      typeof n !== "number" ||
      seconds(n) === null
    )
      return null;
    total += n * units[key];
  }
  return Number.isFinite(total) ? total : null;
}
export function parseTiming(config, expected) {
  if (!config || config.use_blueprint !== undefined)
    throw Error("Blueprint timing cannot be read directly.");
  const raw = config.triggers ?? config.trigger;
  const triggers = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (triggers.length !== 1 || triggers[0].enabled === false)
    throw Error("Choose one enabled on/off trigger with a fixed duration.");
  const t = triggers[0],
    kind = t.trigger ?? t.platform;
  const matches =
    (kind === "device" &&
      t.domain === "switch" &&
      t.type === `turned_${expected}`) ||
    (kind === "state" && t.to === expected && t.attribute === undefined);
  const duration = seconds(t.for);
  if (
    !matches ||
    typeof t.entity_id !== "string" ||
    !t.entity_id ||
    !(duration > 0)
  )
    throw Error(
      `Automation needs a fixed “${expected} for” duration; templates and multiple targets are unsupported.`,
    );
  const conditions = config.conditions ?? config.condition;
  if (conditions != null && !(Array.isArray(conditions) && !conditions.length))
    throw Error("Conditional automations cannot provide a reliable countdown.");
  return { seconds: duration, target: t.entity_id };
}
export function evaluate(plug, timer, now, fallback) {
  if (!plug || !["on", "off"].includes(plug.state)) return { phase: "unknown" };
  const changed = Date.parse(plug.last_changed) / 1000;
  if (plug.state === "off")
    return { phase: "off", offDate: Number.isFinite(changed) ? changed : null };
  if (timer?.state === "paused")
    return {
      phase: "paused",
      remaining: seconds(timer.attributes.remaining),
      duration: seconds(timer.attributes.duration),
    };
  const end = timer
    ? timer.state === "active"
      ? Date.parse(timer.attributes.finishes_at) / 1000
      : NaN
    : changed + fallback;
  const duration = timer ? seconds(timer.attributes.duration) : fallback;
  if (!Number.isFinite(end) || (!timer && (!(fallback > 0) || changed > now)))
    return { phase: "unknown" };
  return {
    phase: end > now ? "heating" : "overdue",
    remaining: Math.max(0, end - now),
    duration,
    cycleID: String(end),
  };
}
export const shouldFlip = (r) =>
  r.phase === "heating" && r.remaining <= r.duration / 2;
export const completed = (off, end) =>
  Number.isFinite(end) && off - end >= -5 && off - end < 300;
export function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export const titles = {
  flip: "Time to flip the coals",
  ready: "Heater is off · collect your coals",
  fresh: "Ready for fresh coals?",
};
export const headlines = {
  heating: "Coals are warming up",
  off: "Heater is off",
  overdue: "Timer ended · heater still on",
  paused: "Countdown paused",
  unknown: "Heater or timer unavailable",
};
