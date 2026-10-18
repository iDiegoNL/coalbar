import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createPlasmaBridge } from "../core/plasma.cjs";

function request(server, path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: server.address().port, path, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode, body, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("live Plasma bridge rejects browser origins, requires nonce, and exposes presentation only", async (t) => {
  const actions = [];
  let presence = 0;
  const server = await createPlasmaBridge({
    port: 0,
    getState: () => ({
      headline: "Warming",
      menuTitle: "08:40",
      config: { url: "private" },
      token: "HA-secret",
      entities: ["private"],
    }),
    onPresence: () => {
      presence++;
    },
    action: (name) => actions.push(name),
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const headers of [
    { Origin: "https://example.org" },
    { Origin: "null" },
    { Origin: "" },
    { Host: "example.org" },
  ]) {
    assert.equal((await request(server, "/state", { headers })).status, 403);
  }
  assert.equal(presence, 0);
  const state = await request(server, "/state");
  assert.equal(state.status, 200);
  assert.equal(state.headers["cache-control"], "no-store");
  const body = JSON.parse(state.body);
  assert.equal(body.menuTitle, "08:40");
  assert.match(body.token, /^[a-f0-9]{64}$/);
  assert.equal(body.config, undefined);
  assert.equal(body.entities, undefined);
  assert.ok(!state.body.includes("HA-secret"));
  assert.equal(presence, 1);
  assert.equal(
    (await request(server, "/dismiss", { method: "POST" })).status,
    404,
  );
  assert.equal(
    (
      await request(server, "/dismiss", {
        method: "POST",
        headers: { "X-CoalBar-Token": "wrong" },
      })
    ).status,
    404,
  );
  for (const path of [
    "/dismiss?x=1",
    "/dismiss/",
    "/%64ismiss",
    "/../quit",
    "/unknown",
  ]) {
    assert.equal(
      (
        await request(server, path, {
          method: "POST",
          headers: { "X-CoalBar-Token": body.token },
        })
      ).status,
      404,
    );
  }
  assert.deepEqual(actions, []);
  assert.equal(
    (
      await request(server, "/dismiss", {
        method: "POST",
        headers: { "X-CoalBar-Token": body.token },
      })
    ).status,
    200,
  );
  assert.deepEqual(actions, ["dismiss"]);
});

test("bridge contains callback failures without leaking details or stopping later requests", async (t) => {
  let failState = false,
    failPresence = false;
  const server = await createPlasmaBridge({
    port: 0,
    getState: () => {
      if (failState) throw Error("private server URL");
      return { menuTitle: "Ready" };
    },
    onPresence: () => {
      if (failPresence) throw Error("private path");
    },
    action: async () => {
      throw Error("private credentials");
    },
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { token } = JSON.parse((await request(server, "/state")).body);
  const action = await request(server, "/dismiss", {
    method: "POST",
    headers: { "X-CoalBar-Token": token },
  });
  assert.equal(action.status, 500);
  assert.equal(action.body, "{}");
  failState = true;
  assert.equal((await request(server, "/state")).status, 500);
  failState = false;
  failPresence = true;
  assert.equal((await request(server, "/state")).body, "{}");
  failPresence = false;
  assert.equal((await request(server, "/state")).status, 200);
});
