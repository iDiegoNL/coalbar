// Launch with Electron, against a disposable profile; no Home Assistant credentials.
const { app, BrowserWindow, screen } = require("electron");
const { panelPosition } = require("../core/tray.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "coalbar-smoke-"));
app.setPath("userData", profile);
require("../main.cjs");
const timeout = setTimeout(() => {
  console.error("Smoke test timed out");
  app.exit(1);
}, 20000);
app.whenReady().then(async () => {
  try {
    while (BrowserWindow.getAllWindows().length < 2)
      await new Promise((r) => setTimeout(r, 50));
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win.webContents.isLoading())
        await new Promise((r) => win.webContents.once("did-finish-load", r));
    }
    const settings = windows.find((w) =>
      w.webContents.getURL().endsWith("#settings"),
    );
    const panel = windows.find((w) => w !== settings);
    await new Promise((r) => setTimeout(r, 500));
    const text = await settings.webContents.executeJavaScript(
      "document.body.innerText",
    );
    if (
      !text.includes("Connect & find entities") ||
      !text.includes("Save & connect")
    )
      throw Error("Settings did not render");
    await settings.webContents.executeJavaScript(
      "window.coalbar.invoke('demo',true)",
    );
    await new Promise((r) => setTimeout(r, 300));
    if (
      !(
        await panel.webContents.executeJavaScript("document.body.innerText")
      ).includes("DEMO")
    )
      throw Error("Demo did not render");
    if (process.platform === "linux" && process.env.DISPLAY) {
      const pointer = screen.getCursorScreenPoint();
      const expected = panelPosition(
        screen.getDisplayNearestPoint(pointer),
        panel.getSize(),
        pointer,
      );
      const actual = panel.getBounds();
      if (
        Math.abs(actual.x - expected.x) > 2 ||
        Math.abs(actual.y - expected.y) > 2
      )
        throw Error(
          `Popup not anchored: ${JSON.stringify({ actual, expected })}`,
        );
    }
    for (const type of ["flip", "ready", "fresh"]) {
      await panel.webContents.executeJavaScript(
        `window.coalbar.invoke('preview','${type}')`,
      );
      const result = await panel.webContents.executeJavaScript(
        "window.coalbar.invoke('state')",
      );
      if (result.value.notice !== type) throw Error("Preview failed: " + type);
    }
    await panel.webContents.executeJavaScript(
      "window.coalbar.invoke('preview','flip')",
    );
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(
      path.join(profile, "panel.png"),
      (await panel.capturePage()).toPNG(),
    );
    settings.show();
    fs.writeFileSync(
      path.join(profile, "settings.png"),
      (await settings.capturePage()).toPNG(),
    );
    console.log(
      "PASS: settings, demo, all reminder previews. Screenshots: " + profile,
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (e) {
    console.error(e);
    clearTimeout(timeout);
    app.exit(1);
  }
});
