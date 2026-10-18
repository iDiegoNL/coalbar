const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  safeStorage,
  Notification,
  powerMonitor,
  screen,
} = require("electron");
const { panelPosition, trayBitmap } = require("./core/tray.cjs");
const fs = require("node:fs");
const path = require("node:path");
let panel,
  settings,
  tray,
  model,
  quitting = false,
  preferences = {},
  startupError = "",
  plasmaSeenAt = 0,
  plasmaPopupRequest = 0,
  plasmaServer,
  storage;
const root = path.join(__dirname, "..");
const iconPath = path.join(root, "Artwork/AppIcon-preview.png");
app.setName("CoalBar");
app.setAppUserModelId("local.coalbar.desktop");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => showSettings());
  app.on("activate", () => showSettings());
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error("CoalBar startup failed:", error.message);
      app.quit();
    });
}
function secureAvailable() {
  return (
    safeStorage.isEncryptionAvailable() &&
    !(
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    )
  );
}
function createWindow(isSettings) {
  const win = new BrowserWindow({
    width: isSettings ? 680 : 380,
    height: isSettings ? 850 : 560,
    minWidth: isSettings ? 580 : 380,
    minHeight: isSettings ? 650 : 560,
    show: false,
    frame: isSettings,
    resizable: isSettings,
    skipTaskbar: !isSettings,
    alwaysOnTop: !isSettings,
    backgroundColor: "#151719",
    title: isSettings ? "CoalBar Settings" : "CoalBar",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });
  win.loadFile(path.join(root, "dist/desktop/index.html"), {
    hash: isSettings ? "settings" : "panel",
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  if (!isSettings) win.on("blur", () => win.hide());
  return win;
}
function showSettings() {
  if (!settings) return;
  settings.show();
  settings.focus();
}
function showPanel() {
  if (Date.now() - plasmaSeenAt < 4000) {
    plasmaPopupRequest = Date.now();
    return;
  }
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
    return;
  }
  const anchor = process.platform === "linux" ? null : tray?.getBounds();
  const pointer = screen.getCursorScreenPoint();
  const display =
    anchor?.width > 0
      ? screen.getDisplayMatching(anchor)
      : screen.getDisplayNearestPoint(pointer);
  const position = panelPosition(display, panel.getSize(), pointer, anchor);
  panel.setPosition(position.x, position.y);
  panel.show();
  // Some X11 window managers place a window themselves on its first map.
  panel.setPosition(position.x, position.y);
  setTimeout(() => {
    if (panel.isVisible()) panel.setPosition(position.x, position.y);
  }, 100);
  panel.focus();
}
function state() {
  return {
    ...model.view,
    preferences,
    secureStorage: secureAvailable(),
    notificationSupported: Notification.isSupported(),
    startupError,
  };
}
function broadcast() {
  const view = state();
  for (const win of [panel, settings])
    if (win && !win.isDestroyed()) win.webContents.send("state", view);
  const plasmaActive = Date.now() - plasmaSeenAt < 4000;
  if (view.visible && !plasmaActive && !tray) {
    tray = new Tray(
      nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 }),
    );
    tray.on("click", () => showPanel());
  } else if ((!view.visible || plasmaActive) && tray) {
    tray.destroy();
    tray = null;
    panel?.hide();
  }
  if (tray) {
    tray.setToolTip(`CoalBar · ${view.menuTitle || view.headline}`);
    if (process.platform === "darwin") tray.setTitle(view.menuTitle);
    else
      tray.setImage(
        nativeImage.createFromBitmap(trayBitmap(view), {
          width: 32,
          height: 32,
        }),
      );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: view.menuTitle || view.headline, click: showPanel },
        { label: "Open CoalBar", click: showPanel },
        { label: "Settings", click: showSettings },
        { type: "separator" },
        { label: "Quit CoalBar", click: () => app.quit() },
      ]),
    );
  }
}
function notify(type) {
  if (!preferences.notifications || !Notification.isSupported()) return;
  const titles = {
    flip: "Time to flip the coals",
    ready: "Heater is off · collect your coals",
    fresh: "Ready for fresh coals?",
  };
  const bodies = {
    flip: "Halfway through heating. Turn the coals over.",
    ready:
      "Home Assistant reports the smart plug is off. Your coals are ready to collect.",
    fresh: "It’s time to consider another batch of coals.",
  };
  const n = new Notification({
    title: titles[type],
    body: bodies[type],
    icon: iconPath,
  });
  n.on("click", showPanel);
  n.show();
}
function setLogin(enabled) {
  if (typeof enabled !== "boolean") throw Error("Invalid login preference.");
  if (!app.isPackaged)
    throw Error("Install a packaged build before enabling launch at login.");
  if (process.platform === "linux") {
    const location = path.join(
      app.getPath("appData"),
      "autostart/coalbar.desktop",
    );
    const executable =
      process.env.APPIMAGE ||
      path.join(path.dirname(app.getPath("exe")), "coalbar");
    if (/[\n\r]/.test(executable)) throw Error("Unsupported executable path.");
    const quoted =
      '"' + executable.replace(/[\\"`$]/g, "\\$&").replace(/%/g, "%%") + '"';
    if (enabled) {
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(
        location,
        `[Desktop Entry]\nType=Application\nName=CoalBar\nExec=${quoted} --background\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`,
      );
    } else fs.rmSync(location, { force: true });
  } else
    app.setLoginItemSettings({ openAtLogin: enabled, args: ["--background"] });
}
async function start() {
  const { HAClient, validateConfig, baseURL } =
    await import("./core/client.mjs");
  const { CoalModel } = await import("./core/model.mjs");
  const { createStorage } = require("./core/storage.cjs");
  storage = createStorage({
    directory: app.getPath("userData"),
    validateConfig,
    encryption: {
      available: secureAvailable,
      encrypt: (token) => safeStorage.encryptString(token),
      decrypt: (value) => safeStorage.decryptString(value),
    },
  });
  const connection = storage.loadConnection();
  startupError = connection.error;
  preferences = storage.loadPreferences();
  model = new CoalModel({
    client: new HAClient(),
    config: connection.config,
    token: connection.token,
    memory: storage.loadMemory(),
    persist: (memory) => storage.saveMemory(memory),
    notify,
    changed: broadcast,
  });
  if (
    process.platform === "linux" &&
    process.env.XDG_CURRENT_DESKTOP?.includes("KDE") &&
    !process.argv.some((arg) => arg.includes("smoke.cjs"))
  ) {
    const { createPlasmaBridge } = require("./core/plasma.cjs");
    try {
      plasmaServer = await createPlasmaBridge({
        getState: () => ({
          ...model.view,
          popupRequest: plasmaPopupRequest,
          reduceMotion: preferences.reduceMotion,
          reduceTransparency: preferences.reduceTransparency,
        }),
        onPresence: () => {
          plasmaSeenAt = Date.now();
        },
        action: (name) => {
          if (name === "quit") app.quit();
          else if (name === "settings") showSettings();
          else if (name === "dismiss") model.dismiss();
          else if (name === "endDemo") model.setDemo(false);
          else model.preview(name);
        },
      });
      app.on("before-quit", () => plasmaServer.close());
    } catch {
      startupError =
        "The Plasma widget bridge could not start (port 43179). The regular tray remains available.";
    }
  }
  panel = createWindow(false);
  settings = createWindow(true);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "CoalBar",
        submenu: [{ label: "Settings", click: showSettings }, { role: "quit" }],
      },
      { role: "editMenu" },
    ]),
  );
  ipcMain.handle("coalbar", async (event, action, payload) => {
    if (
      ![panel.webContents, settings.webContents].includes(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw Error("Untrusted request.");
    try {
      switch (action) {
        case "state":
          return { ok: true, value: state() };
        case "discover": {
          const config = { url: baseURL(payload?.url).href };
          const token =
            payload?.token ||
            (config.url === model.config.url ? model.token : "");
          return { ok: true, value: await model.client.states(config, token) };
        }
        case "save": {
          const config = validateConfig(payload?.config);
          const token =
            typeof payload?.token === "string" && payload.token.trim()
              ? payload.token.trim()
              : config.url === model.config.url
                ? model.token
                : "";
          storage.saveConnection(config, token);
          startupError = "";
          model.configure(config, token);
          void model.refresh();
          break;
        }
        case "demo":
          model.setDemo(!!payload);
          if (payload) showPanel();
          break;
        case "preview":
          model.preview(payload);
          break;
        case "dismiss":
          model.dismiss();
          break;
        case "settings":
          showSettings();
          break;
        case "hide":
          panel.hide();
          break;
        case "quit":
          app.quit();
          break;
        case "preferences": {
          const { updatePreferences } = require("./core/preferences.cjs");
          preferences = updatePreferences(preferences, payload, {
            setLogin,
            persist: (next) => storage.savePreferences(next),
          });
          broadcast();
          break;
        }
        case "testNotification":
          notify("flip");
          break;
        default:
          throw Error("Unknown action.");
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  settings.once("ready-to-show", () => {
    if (
      !model.token ||
      !model.config.plug ||
      startupError ||
      !process.argv.includes("--background")
    )
      showSettings();
  });
  powerMonitor.on("resume", () => {
    model.reachable = false;
    model.tick();
    void model.refresh();
  });
  setInterval(() => void model.refresh(), 5000);
  setInterval(() => model.tick(), 1000);
  void model.refresh();
}
