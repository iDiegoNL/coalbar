import test from "node:test";
import assert from "node:assert/strict";
import tray from "../core/tray.cjs";
const { panelPosition, trayLines, trayBitmap } = tray;
const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
test("Linux bottom taskbar opens above the bar even when demo opens from settings", () => {
  assert.deepEqual(
    panelPosition(
      { bounds, workArea: { ...bounds, height: 1040 } },
      [380, 560],
      { x: 900, y: 300 },
    ),
    { x: 710, y: 472 },
  );
});
test("top and side bars and negative monitor coordinates", () => {
  assert.equal(
    panelPosition(
      { bounds, workArea: { ...bounds, y: 40, height: 1040 } },
      [380, 560],
      { x: 1800, y: 20 },
    ).y,
    48,
  );
  assert.equal(
    panelPosition(
      { bounds, workArea: { ...bounds, x: 48, width: 1872 } },
      [380, 560],
      { x: 10, y: 700 },
    ).x,
    56,
  );
  assert.equal(
    panelPosition(
      { bounds, workArea: { ...bounds, width: 1872 } },
      [380, 560],
      { x: 1900, y: 700 },
    ).x,
    1484,
  );
  const display = {
    bounds: { ...bounds, x: -1920 },
    workArea: { ...bounds, x: -1920, height: 1040 },
  };
  assert.deepEqual(panelPosition(display, [380, 560], { x: -20, y: 1060 }), {
    x: -380,
    y: 472,
  });
});
test("Windows tray bounds override pointer; hidden bars still use an edge", () => {
  assert.deepEqual(
    panelPosition(
      { bounds, workArea: { ...bounds, height: 1040 } },
      [380, 560],
      { x: 0, y: 0 },
      { x: 1800, y: 1040, width: 24, height: 40 },
    ),
    { x: 1540, y: 472 },
  );
  assert.equal(
    panelPosition({ bounds, workArea: bounds }, [380, 560], {
      x: 1700,
      y: 1070,
    }).y,
    512,
  );
});
test("live icons include countdown and all reminder states", () => {
  const view = { reading: { phase: "heating" }, menuTitle: "08:40" };
  assert.deepEqual(trayLines(view), ["08:", "40"]);
  assert.deepEqual(
    trayLines({ ...view, notice: "flip", menuTitle: "Flip · 06:30" }),
    ["FLIP", "06:30"],
  );
  assert.deepEqual(trayLines({ ...view, notice: "ready" }), ["READY"]);
  assert.deepEqual(trayLines({ ...view, notice: "fresh" }), ["NEW", "COALS"]);
  assert.notDeepEqual(
    trayBitmap(view),
    trayBitmap({ ...view, menuTitle: "08:39" }),
  );
  assert.equal(trayBitmap(view).length, 4096);
});
