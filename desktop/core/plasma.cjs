const http = require("node:http");
const { randomBytes } = require("node:crypto");
// Only public presentation state crosses this bridge, never HA settings/tokens.
function publicState(view) {
  return Object.fromEntries(
    [
      "popupRequest",
      "reduceMotion",
      "reduceTransparency",
      "presentation",
      "reachable",
      "headline",
      "menuTitle",
      "notice",
      "reading",
      "freshRemaining",
      "demo",
      "visible",
    ].map((key) => [key, view[key]]),
  );
}
function createPlasmaBridge({
  getState,
  action,
  port = 43179,
  onPresence = () => {},
}) {
  const token = randomBytes(32).toString("hex");
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const reply = (status, body = {}) => {
      if (res.destroyed || res.writableEnded) return;
      const encoded = JSON.stringify(body);
      res.writeHead(status);
      res.end(encoded);
    };
    try {
      // No browser origins/CORS: only the local QML client may read the nonce.
      if (
        req.headers.origin !== undefined ||
        !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "")
      ) {
        reply(403);
        return;
      }
      if (req.method === "GET" && req.url === "/state") {
        const state = publicState(await getState());
        await onPresence();
        reply(200, { ...state, token });
        return;
      }
      if (req.method === "POST" && req.headers["x-coalbar-token"] === token) {
        const name = (req.url || "").slice(1);
        if (
          [
            "dismiss",
            "settings",
            "flip",
            "ready",
            "fresh",
            "endDemo",
            "quit",
          ].includes(name)
        ) {
          await action(name);
          reply(200);
          return;
        }
      }
      reply(404);
    } catch {
      // Persistence or desktop operations can fail. Never crash the app or
      // expose exception details (which can include private configuration).
      reply(500);
    }
  });
  server.requestTimeout = 3000;
  server.headersTimeout = 3000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}
module.exports = { createPlasmaBridge, publicState };
