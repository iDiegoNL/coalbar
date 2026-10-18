import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Exercise the widget's actual polling functions with a controllable QML XHR
// adapter. This covers hangs and process restarts without requiring a panel.
function widget() {
  let now = 10000;
  const requests = [];
  class Request {
    static DONE = 4;
    readyState = 0;
    constructor() {
      requests.push(this);
    }
    open() {}
    send() {}
    setRequestHeader() {}
    abort() {
      this.aborted = true;
    }
    complete(body, status = 200) {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.readyState = 4;
      this.onreadystatechange();
    }
  }
  const context = vm.createContext({
    Date: { now: () => now },
    XMLHttpRequest: Request,
    snapshot: {},
    connected: false,
    pollRequest: null,
    pollStartedAt: 0,
    actionRequests: [],
    bridgeToken: "",
    receivedAt: 0,
    lastPopupRequest: 0,
    root: { expanded: false },
  });
  const source = readFileSync(
    new URL("../plasma/package/contents/ui/main.qml", import.meta.url),
    "utf8",
  );
  vm.runInContext(
    source.slice(
      source.indexOf("    function disconnect()"),
      source.indexOf("    Component.onDestruction:"),
    ),
    context,
  );
  return {
    context,
    requests,
    advance: (amount) => {
      now += amount;
    },
  };
}

test("hung Plasma polls abort, clear stale presentation and recover", () => {
  const { context: c, requests, advance } = widget();
  c.refresh();
  requests[0].complete({ token: "process-one", menuTitle: "08:40" });
  c.refresh();
  const hung = requests[1];
  advance(3001);
  c.refresh();
  assert.equal(hung.aborted, true);
  assert.equal(c.connected, false);
  assert.equal(c.snapshot.menuTitle, undefined);
  assert.equal(requests.length, 3);
  hung.complete({ token: "process-one", menuTitle: "stale" });
  assert.equal(c.connected, false);
  requests[2].complete({ token: "process-one", menuTitle: "08:35" });
  assert.equal(c.connected, true);
  assert.equal(c.snapshot.menuTitle, "08:35");
});

test("popup requests are consumed once per bridge process and action hangs expire", () => {
  const { context: c, requests, advance } = widget();
  const poll = (body) => {
    c.refresh();
    requests.at(-1).complete(body);
  };
  poll({ token: "one", popupRequest: 50 });
  assert.equal(c.root.expanded, false);
  poll({ token: "one", popupRequest: 51 });
  assert.equal(c.root.expanded, true);
  c.root.expanded = false;
  poll({ token: "one", popupRequest: 51 });
  assert.equal(c.root.expanded, false);
  poll({ token: "two", popupRequest: 0 });
  poll({ token: "two", popupRequest: 1 });
  assert.equal(c.root.expanded, true);
  c.act("dismiss");
  const hung = requests.at(-1);
  advance(3001);
  c.refresh();
  assert.equal(hung.aborted, true);
  assert.equal(c.actionRequests.length, 0);
});
