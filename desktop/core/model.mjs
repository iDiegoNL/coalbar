import { present } from "./presentation.mjs";
import {
  evaluate,
  shouldFlip,
  completed,
  parseTiming,
  clockText,
  titles,
} from "./domain.mjs";
export class CoalModel {
  constructor({
    client,
    config,
    token = "",
    memory = {},
    persist = () => {},
    notify = () => {},
    changed = () => {},
    now = () => Date.now() / 1000,
  }) {
    Object.assign(this, {
      client,
      config,
      token,
      memory,
      persist,
      notify,
      changed,
      now,
    });
    this.seen = new Set(memory.seen || []);
    this.generation = 0;
    this.demo = false;
    this.reachable = false;
    this.reading = { phase: "unknown" };
    this.status = "Open Settings to connect Home Assistant.";
    this.entities = [];
    this.notice = null;
  }
  get key() {
    return `${this.config.url}|${this.config.plug}|${this.config.heatingAutomation}`;
  }
  get view() {
    const r = this.reading;
    return {
      config: this.config,
      hasToken: !!this.token,
      entities: this.entities,
      reading: r,
      demo: this.demo,
      notice: this.notice,
      reachable: this.reachable,
      visible: this.demo || (this.reachable && !!this.config.plug),
      status: [this.status, this.persistenceError, this.notificationError]
        .filter(Boolean)
        .join(" · "),
      timingSummary:
        this.timingSummary || "Select your two Home Assistant automations.",
      ...present({
        reading: r,
        notice: this.notice,
        reachable: this.reachable,
        demo: this.demo,
        freshRemaining:
          this.freshDue == null
            ? null
            : Math.max(0, this.freshDue - this.now()),
      }),
    };
  }
  emit() {
    this.changed(this.view);
  }
  saveMemory() {
    this.memory.seen = [...this.seen];
    try {
      this.persist(this.memory);
      this.persistenceError = "";
    } catch {
      this.persistenceError =
        "Reminder history could not be saved; reminders may repeat after restarting.";
    }
  }
  configure(config, token) {
    this.generation++;
    this.config = config;
    this.token = token;
    this.demo = false;
    this.reachable = false;
    this.timings = null;
    this.snapshot = {};
    this.notice = null;
    this.reading = { phase: "unknown" };
    this.freshDue = null;
    this.emit();
  }
  async refresh() {
    if (this.demo || !this.token || this.busy === this.generation) return;
    const version = this.generation,
      config = { ...this.config },
      token = this.token;
    this.busy = version;
    const current = () => version === this.generation && !this.demo;
    try {
      const states = await this.client.states(config, token);
      if (!current()) return;
      const fetchedAt = this.now();
      const snapshot = Object.fromEntries(states.map((s) => [s.entity_id, s]));
      this.entities = states.sort((a, b) =>
        (a.attributes.friendly_name || a.entity_id).localeCompare(
          b.attributes.friendly_name || b.entity_id,
        ),
      );
      if (!this.timings || this.now() - this.timingsAt >= 60) {
        try {
          const ids = [config.heatingAutomation, config.reminderAutomation].map(
            (id) => snapshot[id]?.attributes.id,
          );
          if (!ids.every((id) => typeof id === "string" && id))
            throw Error(
              "Select both automations with accessible configuration IDs.",
            );
          const raw = await Promise.all(
            ids.map((id) => this.client.automation(config, token, id)),
          );
          if (!current()) return;
          const [heat, fresh] = raw.map((data, i) =>
            parseTiming(data, i ? "off" : "on"),
          );
          if (
            heat.target !== fresh.target ||
            (heat.target.includes(".") && heat.target !== config.plug)
          )
            throw Error(
              "Both automations must monitor the selected smart plug.",
            );
          this.timings = { heat, fresh };
          this.timingsAt = this.now();
          this.timingSummary = `Heating ${clockText(heat.seconds)} · Flip at ${clockText(heat.seconds / 2)} · Fresh coals after ${clockText(fresh.seconds)}`;
        } catch (error) {
          if (!current()) return;
          this.timings = null;
          this.reading = { phase: "unknown" };
          this.notice = null;
          this.freshDue = null;
          this.status = error.message;
          this.timingSummary = error.message;
          this.emit();
          return;
        }
      }
      this.snapshot = snapshot;
      this.lastUpdated = fetchedAt;
      this.reachable = true;
      this.status = "Connected · timings synced from Home Assistant";
      this.tick();
    } catch (error) {
      if (!current()) return;
      this.reachable = false;
      this.status = error.message;
      this.emit();
    } finally {
      if (this.busy === version) this.busy = null;
    }
  }
  remind(type, id) {
    const key = `${this.key}|${id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 500) this.seen = new Set([key]);
    this.notice = type;
    this.saveMemory();
    try {
      this.notify(type);
      this.notificationError = "";
    } catch {
      this.notificationError =
        "Desktop notification failed; the reminder remains in CoalBar.";
    }
  }
  tick() {
    const now = this.now();
    if (this.demo) {
      this.reading =
        this.demoStage === "ready" || this.demoStage === "fresh"
          ? { phase: "off", offDate: this.demoOff }
          : {
              phase: "heating",
              remaining: Math.max(0, this.demoEnd - now),
              duration: 780,
              cycleID: "demo",
            };
      this.freshDue = this.demoOff == null ? null : this.demoOff + 3600;
      this.emit();
      return;
    }
    if (
      !this.reachable ||
      this.lastUpdated == null ||
      now - this.lastUpdated >= 20
    ) {
      this.reachable = false;
      this.emit();
      return;
    }
    if (!this.timings) return;
    const enabled =
      this.snapshot[this.config.heatingAutomation]?.state === "on";
    const previous = this.reading;
    this.reading = evaluate(
      this.snapshot[this.config.plug],
      null,
      now,
      enabled ? this.timings.heat.seconds : null,
    );
    const r = this.reading;
    this.freshDue =
      r.phase === "off" &&
      r.offDate != null &&
      this.snapshot[this.config.reminderAutomation]?.state === "on"
        ? r.offDate + this.timings.fresh.seconds
        : null;
    if (!enabled && this.memory.deadline?.key === this.key) {
      delete this.memory.deadline;
      this.saveMemory();
    }
    if (r.phase === "heating") {
      if (
        this.memory.deadline?.end !== Number(r.cycleID) ||
        this.memory.deadline?.key !== this.key
      ) {
        this.memory.deadline = { key: this.key, end: Number(r.cycleID) };
        this.saveMemory();
      }
      if (previous.cycleID !== r.cycleID) this.notice = null;
      if (shouldFlip(r)) this.remind("flip", `flip-${r.cycleID}`);
    } else if (r.phase === "off") {
      if (
        this.notice === "flip" ||
        (this.notice === "fresh" && this.freshDue == null) ||
        (this.notice === "ready" && !enabled)
      )
        this.notice = null;
      if (r.offDate != null) {
        const age = now - r.offDate,
          deadline = this.memory.deadline;
        if (
          enabled &&
          age >= 0 &&
          age < 300 &&
          deadline?.key === this.key &&
          completed(r.offDate, deadline.end)
        )
          this.remind("ready", `off-${r.offDate}`);
        if (
          this.freshDue != null &&
          now >= this.freshDue &&
          now - this.freshDue < 7200
        )
          this.remind("fresh", `fresh-${this.freshDue}`);
      }
    } else this.notice = null;
    this.emit();
  }
  dismiss() {
    this.notice = null;
    this.emit();
  }
  setDemo(enabled) {
    this.generation++;
    this.demo = enabled;
    this.demoStage = null;
    this.demoOff = null;
    this.notice = null;
    this.demoEnd = this.now() + 522;
    this.reachable = false;
    if (!enabled) {
      this.timings = null;
      this.reading = { phase: "unknown" };
      this.freshDue = null;
      void this.refresh();
    }
    this.tick();
  }
  preview(type) {
    if (!this.demo || !Object.hasOwn(titles, type)) return;
    this.demoStage = type;
    this.notice = type;
    this.demoEnd = this.now() + 390;
    this.demoOff =
      type === "flip" ? null : this.now() - (type === "fresh" ? 3600 : 0);
    this.tick();
  }
}
