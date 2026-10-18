import { clockText, headlines, titles } from "./domain.mjs";

// One presentation decision for both desktop renderers. Offline readings are
// deliberately discarded here so a live bridge cannot make stale heat look live.
export function present({ reading, notice, freshRemaining, reachable, demo }) {
  const available = demo || reachable;
  const r = available ? reading : { phase: "unknown" };
  const activeNotice = available && r.phase !== "unknown" ? notice : null;
  const fresh = available && r.phase === "off" ? freshRemaining : null;
  const heating = r.phase === "heating" || r.phase === "overdue";
  const noticeText = {
    flip: "Turn them for an even glow.",
    ready: "The plug is off. Time to collect.",
    fresh: "Time to put new coals on?",
  };
  return {
    reading: r,
    notice: activeNotice,
    freshRemaining: fresh,
    headline: titles[activeNotice] || headlines[r.phase] || headlines.unknown,
    menuTitle:
      activeNotice === "flip"
        ? `Flip · ${clockText(r.remaining)}`
        : activeNotice === "ready"
          ? "Ready"
          : activeNotice === "fresh"
            ? "New coals?"
            : r.phase === "heating"
              ? clockText(r.remaining)
              : r.phase === "paused"
                ? `Paused · ${clockText(r.remaining)}`
                : r.phase === "overdue"
                  ? "Check heater"
                  : r.phase === "off"
                    ? ""
                    : "Check timer",
    presentation: {
      heating,
      clock:
        r.phase === "heating" || r.phase === "paused"
          ? clockText(r.remaining)
          : r.phase === "overdue"
            ? "Check heater"
            : r.phase === "unknown"
              ? "Unavailable"
              : activeNotice === "fresh"
                ? "Another round?"
                : fresh != null
                  ? clockText(fresh)
                  : "All quiet",
      subtitle: !available
        ? "Check your Home Assistant connection."
        : r.phase === "unknown"
          ? "Check your connection and automations."
          : r.phase === "overdue"
            ? "Countdown ended. Check the heater."
            : r.phase === "paused"
              ? "Heating countdown is paused."
              : r.phase === "heating"
                ? "Until expected switch-off"
                : activeNotice === "fresh"
                  ? "A fresh batch, whenever you’re ready."
                  : fresh != null
                    ? "Until fresh coals"
                    : "Ready for your next session.",
      progress:
        r.duration > 0 && r.remaining != null
          ? Math.max(0, Math.min(1, 1 - r.remaining / r.duration))
          : null,
      noticeText: noticeText[activeNotice] || "",
    },
  };
}
