import test from "node:test";
import assert from "node:assert/strict";
import { updatePreferences } from "../core/preferences.cjs";
const current = { launchAtLogin: false, notifications: true };
test("failed preference save restores startup registration and preserves current state", () => {
  let startup = false;
  const calls = [];
  assert.throws(
    () =>
      updatePreferences(
        current,
        { launchAtLogin: true },
        {
          setLogin(value) {
            startup = value;
            calls.push(value);
          },
          persist() {
            throw Error("disk full");
          },
        },
      ),
    /disk full/,
  );
  assert.equal(startup, false);
  assert.deepEqual(calls, [true, false]);
  assert.equal(current.launchAtLogin, false);
});
test("failed rollback reports uncertain startup state and same-value request can repair it", () => {
  let startup = false;
  assert.throws(
    () =>
      updatePreferences(
        current,
        { launchAtLogin: true },
        {
          setLogin(value) {
            if (!value) throw Error("access denied");
            startup = value;
          },
          persist() {
            throw Error("disk full");
          },
        },
      ),
    /startup setting may have changed.*Retry/,
  );
  assert.equal(startup, true);
  let saved;
  const next = updatePreferences(
    current,
    { launchAtLogin: false },
    {
      setLogin(value) {
        startup = value;
      },
      persist(value) {
        saved = value;
      },
    },
  );
  assert.equal(startup, false);
  assert.equal(next.launchAtLogin, false);
  assert.deepEqual(saved, next);
});
test("startup registration failure prevents persistence; other preferences do not touch startup", () => {
  let writes = 0;
  assert.throws(
    () =>
      updatePreferences(
        current,
        { launchAtLogin: true },
        {
          setLogin() {
            throw Error("registration failed");
          },
          persist() {
            writes++;
          },
        },
      ),
    /registration failed/,
  );
  assert.equal(writes, 0);
  const next = updatePreferences(
    current,
    { notifications: false, reduceMotion: "invalid" },
    {
      setLogin() {
        assert.fail("unrelated preference must not alter startup");
      },
      persist() {
        writes++;
      },
    },
  );
  assert.equal(writes, 1);
  assert.deepEqual(next, { launchAtLogin: false, notifications: false });
});
