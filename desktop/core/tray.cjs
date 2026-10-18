// Electron's Linux tray does not expose icon bounds. Use the reserved work-area
// edge on the pointer's display, with the nearest edge for auto-hidden panels.
function panelPosition(display, size, pointer, anchor) {
  const b = display.bounds,
    a = display.workArea,
    [w, h] = size;
  const p =
    anchor?.width > 0 && anchor?.height > 0
      ? { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }
      : pointer;
  const edges = [
    { name: "top", gap: a.y - b.y, distance: Math.abs(p.y - b.y) },
    {
      name: "bottom",
      gap: b.y + b.height - a.y - a.height,
      distance: Math.abs(p.y - b.y - b.height),
    },
    { name: "left", gap: a.x - b.x, distance: Math.abs(p.x - b.x) },
    {
      name: "right",
      gap: b.x + b.width - a.x - a.width,
      distance: Math.abs(p.x - b.x - b.width),
    },
  ];
  const reserved = edges.filter((e) => e.gap > 0);
  const edge = (reserved.length ? reserved : edges).sort(
    (x, y) => x.distance - y.distance,
  )[0].name;
  let x = p.x - w / 2,
    y = p.y - h / 2;
  if (edge === "top") y = a.y + 8;
  if (edge === "bottom") y = a.y + a.height - h - 8;
  if (edge === "left") x = a.x + 8;
  if (edge === "right") x = a.x + a.width - w - 8;
  const clamp = (v, start, length, item) =>
    Math.round(
      Math.max(start, Math.min(v, start + Math.max(0, length - item))),
    );
  return { x: clamp(x, a.x, a.width, w), y: clamp(y, a.y, a.height, h) };
}
// Small pixel font remains crisp after the desktop scales the 32px tray icon.
const glyphs = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"],
  F: ["111", "100", "110", "100", "100"],
  L: ["100", "100", "100", "100", "111"],
  I: ["111", "010", "010", "010", "111"],
  P: ["110", "101", "110", "100", "100"],
  R: ["110", "101", "110", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  A: ["010", "101", "111", "101", "101"],
  D: ["110", "101", "101", "101", "110"],
  Y: ["101", "101", "010", "010", "010"],
  N: ["101", "111", "111", "111", "101"],
  W: ["101", "101", "111", "111", "101"],
  C: ["111", "100", "100", "100", "111"],
  H: ["101", "101", "111", "101", "101"],
  K: ["101", "101", "110", "101", "101"],
  O: ["111", "101", "101", "101", "111"],
  T: ["111", "010", "010", "010", "010"],
  M: ["101", "111", "111", "101", "101"],
  "?": ["111", "001", "010", "000", "010"],
  "!": ["1", "1", "1", "0", "1"],
};
function trayLines(view) {
  if (view.notice === "ready") return ["READY"];
  if (view.notice === "fresh") return ["NEW", "COALS"];
  if (view.notice === "flip")
    return ["FLIP", view.menuTitle.replace(/^Flip · /, "")];
  if (view.reading.phase === "heating") {
    const [minutes, seconds] = view.menuTitle.split(":");
    return [minutes + ":", seconds];
  }
  if (view.reading.phase === "off") return ["OFF"];
  if (view.reading.phase === "overdue") return ["CHECK", "HEAT"];
  if (view.reading.phase === "paused") return ["PAUSE"];
  return ["CHECK", "TIMER"];
}
glyphs.S = ["111", "100", "111", "001", "111"];
glyphs.U = ["101", "101", "101", "101", "111"];
function trayBitmap(view) {
  const data = Buffer.alloc(32 * 32 * 4),
    lines = trayLines(view);
  function pixel(x, y, r, g, b) {
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
    const i = (y * 32 + x) * 4;
    data[i] = b;
    data[i + 1] = g;
    data[i + 2] = r;
    data[i + 3] = 255;
  }
  // Dark backing ensures readable digits on both light and dark panels.
  for (let y = 1; y < 31; y++)
    for (let x = 1; x < 31; x++) pixel(x, y, 28, 30, 32);
  lines.forEach((line, index) => {
    const chars = [...line].map((c) => glyphs[c] || glyphs["?"]);
    const width = chars.reduce((n, c) => n + c[0].length + 1, 0) - 1;
    const scale = Math.min(2, Math.max(1, Math.floor(30 / width)));
    let x = Math.floor((32 - width * scale) / 2);
    const y = lines.length === 1 ? 11 : index === 0 ? 4 : 19;
    for (const char of chars) {
      char.forEach((row, dy) =>
        [...row].forEach((on, dx) => {
          if (on === "1")
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++)
                pixel(x + dx * scale + sx, y + dy * scale + sy, 255, 174, 112);
        }),
      );
      x += (char[0].length + 1) * scale;
    }
  });
  return data;
}
module.exports = { panelPosition, trayLines, trayBitmap };
