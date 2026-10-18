import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorage } from "../core/storage.cjs";
import { validateConfig } from "../core/client.mjs";
const config = (url) => ({
  url,
  plug: "switch.heater",
  heatingAutomation: "automation.heat",
  reminderAutomation: "automation.fresh",
});
const encryption = {
  available: () => true,
  encrypt: (s) => Buffer.from(`encrypted:${s}`),
  decrypt: (b) => {
    const value = b.toString();
    if (!value.startsWith("encrypted:")) throw Error("invalid");
    return value.slice(10);
  },
};
function setup(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coalbar-storage-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const make = (extra = {}) =>
    createStorage({
      directory,
      encryption,
      validateConfig,
      ...overrides,
      ...extra,
    });
  return {
    directory,
    make,
    put: (name, data) =>
      fs.writeFileSync(path.join(directory, name), JSON.stringify(data)),
  };
}
test("connection save is atomic across URL and encrypted credential, including rename failure", (t) => {
  const { make, directory } = setup(t);
  const store = make();
  store.saveConnection(config("http://old.test/"), "old-secret");
  const broken = make({
    filesystem: {
      ...fs,
      renameSync() {
        throw Error("disk failure");
      },
    },
  });
  assert.throws(
    () => broken.saveConnection(config("http://new.test/"), "new-secret"),
    /disk failure/,
  );
  assert.equal(make().loadConnection().config.url, "http://old.test/");
  assert.equal(make().loadConnection().token, "old-secret");
  assert.deepEqual(fs.readdirSync(directory), ["connection.json"]);
  store.saveConnection(config("http://new.test/"), "new-secret");
  assert.equal(make().loadConnection().config.url, "http://new.test/");
  assert.equal(make().loadConnection().token, "new-secret");
});
test("legacy configuration and credential migrate together; malformed new record never falls back", (t) => {
  const { make, put, directory } = setup(t);
  put("configuration.json", config("http://legacy.test/"));
  put(
    "credentials.json",
    encryption.encrypt("legacy-token").toString("base64"),
  );
  assert.equal(make().loadConnection().token, "legacy-token");
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(directory, "connection.json"))).config
      .url,
    "http://legacy.test/",
  );
  put("connection.json", null);
  const result = make().loadConnection();
  assert.equal(result.token, "");
  assert.match(result.error, /invalid/);
});
test("locked keyring retains server configuration without returning a credential", (t) => {
  const { make } = setup(t);
  make().saveConnection(config("http://server.test/"), "secret");
  const result = make({
    encryption: { ...encryption, available: () => false },
  }).loadConnection();
  assert.equal(result.config.url, "http://server.test/");
  assert.equal(result.token, "");
  assert.match(result.error, /keyring/);
});
test("malformed preferences and reminder memory restore safe defaults", (t) => {
  const { make, put } = setup(t);
  put("preferences.json", { notifications: "true", reduceMotion: true });
  put("reminders.json", {
    seen: {},
    deadline: { key: "server", end: "tomorrow" },
  });
  assert.deepEqual(make().loadPreferences(), {
    notifications: true,
    launchAtLogin: false,
    reduceMotion: true,
    reduceTransparency: false,
  });
  assert.deepEqual(make().loadMemory(), { seen: [] });
  put("reminders.json", { seen: ["a", null, 12, "b"] });
  assert.deepEqual(make().loadMemory(), { seen: ["a", "b"] });
  put("preferences.json", null);
  assert.equal(make().loadPreferences().notifications, true);
});
