const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const defaults = {
  url: "http://homeassistant.local:8123/",
  plug: "",
  heatingAutomation: "",
  reminderAutomation: "",
};
const preferenceDefaults = {
  notifications: true,
  launchAtLogin: false,
  reduceMotion: false,
  reduceTransparency: false,
};
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

// Configuration and its encrypted credential form one atomic record. Callers
// never need to coordinate their order or recover a partially saved connection.
function createStorage({
  directory,
  encryption,
  validateConfig,
  filesystem = fs,
}) {
  const file = (name) => path.join(directory, name);
  function read(name) {
    try {
      return JSON.parse(filesystem.readFileSync(file(name), "utf8"));
    } catch {
      return null;
    }
  }
  function write(name, data) {
    filesystem.mkdirSync(directory, { recursive: true });
    const temporary = file(`${name}.${randomUUID()}.tmp`);
    try {
      filesystem.writeFileSync(temporary, JSON.stringify(data), {
        mode: 0o600,
        flag: "wx",
      });
      filesystem.renameSync(temporary, file(name));
    } finally {
      filesystem.rmSync(temporary, { force: true });
    }
  }
  function saveConnection(config, token) {
    config = validateConfig(config);
    if (typeof token !== "string" || !token.trim())
      throw Error("Enter an access token for this server.");
    if (!encryption.available())
      throw Error(
        "Secure storage is unavailable. Unlock or install a Secret Service keyring (for example GNOME Keyring or KWallet), then restart CoalBar.",
      );
    const credential = encryption.encrypt(token).toString("base64");
    write("connection.json", { version: 1, config, credential });
  }
  function loadConnection() {
    let config = { ...defaults };
    try {
      const exists = filesystem.existsSync(file("connection.json"));
      const record = exists
        ? read("connection.json")
        : {
            version: 1,
            config: read("configuration.json"),
            credential: read("credentials.json"),
          };
      if (!exists && record.config == null && record.credential == null)
        return { config, token: "", error: "" };
      if (
        !object(record) ||
        record.version !== 1 ||
        typeof record.credential !== "string" ||
        !record.credential
      )
        throw Error(
          "Saved connection is invalid. Enter your connection settings again.",
        );
      config = validateConfig(record.config);
      if (!encryption.available())
        throw Error(
          "Unlock your system keyring and restart CoalBar to read the saved token.",
        );
      let token;
      try {
        token = encryption.decrypt(Buffer.from(record.credential, "base64"));
        if (typeof token !== "string" || !token) throw Error();
      } catch {
        throw Error("Could not unlock the saved token. Enter it again.");
      }
      // Migrate only after the old pair has been validated and decrypted.
      if (!exists)
        write("connection.json", {
          version: 1,
          config,
          credential: record.credential,
        });
      return { config, token, error: "" };
    } catch (error) {
      return { config, token: "", error: error.message };
    }
  }
  return {
    loadConnection,
    saveConnection,
    loadPreferences() {
      const saved = read("preferences.json");
      return Object.fromEntries(
        Object.entries(preferenceDefaults).map(([key, fallback]) => [
          key,
          typeof saved?.[key] === "boolean" ? saved[key] : fallback,
        ]),
      );
    },
    savePreferences: (preferences) => write("preferences.json", preferences),
    loadMemory() {
      const saved = read("reminders.json");
      const memory = {
        seen: Array.isArray(saved?.seen)
          ? saved.seen.filter((key) => typeof key === "string").slice(-500)
          : [],
      };
      if (
        object(saved?.deadline) &&
        typeof saved.deadline.key === "string" &&
        Number.isFinite(saved.deadline.end)
      )
        memory.deadline = saved.deadline;
      return memory;
    },
    saveMemory: (memory) => write("reminders.json", memory),
  };
}
module.exports = { createStorage };
