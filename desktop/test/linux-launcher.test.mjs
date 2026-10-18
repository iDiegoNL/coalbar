import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import afterPack from "../after-pack.cjs";

test(
  "packaged Linux launcher selects X11 before starting Electron",
  {
    skip: process.platform === "win32",
  },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "coalbar package "));
    try {
      const executable = path.join(directory, "coalbar");
      await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
        mode: 0o755,
      });
      await afterPack({ electronPlatformName: "linux", appOutDir: directory });
      const launch = (display, args) => {
        const result = spawnSync(executable, args, {
          env: { ...process.env, DISPLAY: display },
          encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim().split("\n");
      };
      assert.deepEqual(launch(":0", ["--background", "argument with spaces"]), [
        "--ozone-platform=x11",
        "--background",
        "argument with spaces",
      ]);
      assert.deepEqual(launch(":0", ["--ozone-platform=wayland"]), [
        "--ozone-platform=wayland",
      ]);
      assert.deepEqual(launch(":0", ["--ozone-platform", "wayland"]), [
        "--ozone-platform",
        "wayland",
      ]);
      assert.deepEqual(launch("", ["--background"]), ["--background"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
