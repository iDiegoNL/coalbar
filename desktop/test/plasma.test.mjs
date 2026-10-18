import test from "node:test";
import assert from "node:assert/strict";
import { publicState } from "../core/plasma.cjs";
test("Plasma bridge never publishes configuration or Home Assistant credentials", () => {
  const result = publicState({
    config: { url: "private", plug: "private" },
    token: "secret",
    entities: [1],
    headline: "Warming",
    menuTitle: "08:40",
    reading: { phase: "heating" },
    demo: true,
  });
  assert.equal(result.config, undefined);
  assert.equal(result.token, undefined);
  assert.equal(result.entities, undefined);
  assert.equal(result.menuTitle, "08:40");
});
