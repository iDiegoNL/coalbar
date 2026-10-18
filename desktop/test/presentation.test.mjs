import test from "node:test";
import assert from "node:assert/strict";
import { present } from "../core/presentation.mjs";
import { CoalModel } from "../core/model.mjs";
import { publicState } from "../core/plasma.cjs";

const heating = { phase: "heating", remaining: 390, duration: 780 };
test("disconnected presentation cannot expose a stale heater or reminder", () => {
  const result = present({
    reading: heating,
    notice: "flip",
    freshRemaining: 100,
    reachable: false,
  });
  assert.equal(result.reading.phase, "unknown");
  assert.equal(result.notice, null);
  assert.equal(result.freshRemaining, null);
  assert.equal(result.presentation.heating, false);
  assert.equal(result.presentation.clock, "Unavailable");
  assert.equal(result.presentation.progress, null);
  assert.match(result.headline, /unavailable/);
});
test("unknown readings never describe an off heater, while demo remains available", () => {
  const unknown = present({
    reading: { phase: "unknown" },
    notice: "ready",
    reachable: true,
  });
  assert.match(unknown.headline, /unavailable/);
  assert.equal(unknown.notice, null);
  const demo = present({
    reading: heating,
    notice: "flip",
    demo: true,
    reachable: false,
  });
  assert.equal(demo.presentation.clock, "06:30");
  assert.equal(demo.presentation.progress, 0.5);
  assert.equal(demo.menuTitle, "Flip · 06:30");
});
test("both desktop renderers receive the same safe presentation and preferences", () => {
  for (const phase of ["heating", "overdue", "paused", "off", "unknown"]) {
    const view = present({
      reading: { ...heating, phase },
      reachable: true,
      freshRemaining: 120,
    });
    const plasma = publicState({
      ...view,
      reduceTransparency: true,
      reduceMotion: true,
    });
    assert.deepEqual(plasma.presentation, view.presentation);
    assert.equal(plasma.headline, view.headline);
    assert.equal(plasma.reduceTransparency, true);
    assert.equal(plasma.reduceMotion, true);
    if (phase === "paused") assert.equal(view.menuTitle, "Paused · 06:30");
    if (phase === "overdue")
      assert.equal(view.presentation.clock, "Check heater");
  }
});

test("model publishes sanitized presentation through its public view", () => {
  const model = new CoalModel({
    client: {},
    config: { plug: "switch.heater" },
  });
  model.reading = heating;
  model.notice = "flip";
  const offline = model.view;
  assert.equal(offline.notice, null);
  assert.equal(offline.reading.phase, "unknown");
  assert.equal(offline.presentation.clock, "Unavailable");
  model.setDemo(true);
  assert.equal(model.view.presentation.heating, true);
  assert.equal(model.view.visible, true);
});
