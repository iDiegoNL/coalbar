export function baseURL(text) {
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    throw Error("Enter a valid Home Assistant HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error(
      "Server URL must use HTTP(S), without credentials, query, or fragment.",
    );
  url.pathname = url.pathname.replace(/\/*$/, "/");
  return url;
}
export function validateConfig(input) {
  if (!input || typeof input !== "object") throw Error("Invalid settings.");
  const config = Object.fromEntries(
    ["url", "plug", "heatingAutomation", "reminderAutomation"].map((k) => [
      k,
      typeof input[k] === "string" ? input[k].trim() : "",
    ]),
  );
  config.url = baseURL(config.url).href;
  if (!/^(switch|input_boolean)\.[\w]+$/.test(config.plug))
    throw Error("Choose the heater switch.");
  if (
    ![config.heatingAutomation, config.reminderAutomation].every((s) =>
      /^automation\.[\w]+$/.test(s),
    )
  )
    throw Error("Choose both automations.");
  return config;
}
export class HAClient {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
  }
  async request(config, token, path) {
    if (typeof token !== "string" || !token.trim())
      throw Error("Enter a Home Assistant access token.");
    let response;
    try {
      response = await this.fetcher(new URL(path, baseURL(config.url)), {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw Error("Home Assistant is unreachable or the request timed out.");
    }
    if (response.status === 401 || response.status === 403)
      throw Error(
        "Home Assistant denied access. Check the token and permissions.",
      );
    if (response.status >= 300 && response.status < 400)
      throw Error("Redirect refused. Use the direct Home Assistant URL.");
    if (response.status !== 200)
      throw Error(
        `Home Assistant returned HTTP ${response.status}. Check automation IDs and configuration access.`,
      );
    try {
      return await response.json();
    } catch {
      throw Error("Home Assistant returned invalid JSON.");
    }
  }
  async states(config, token) {
    const data = await this.request(config, token, "api/states");
    if (
      !Array.isArray(data) ||
      !data.every(
        (s) =>
          typeof s.entity_id === "string" &&
          typeof s.state === "string" &&
          s.attributes &&
          typeof s.last_changed === "string",
      )
    )
      throw Error("The URL did not return Home Assistant states.");
    return data;
  }
  automation(config, token, id) {
    return this.request(
      config,
      token,
      `api/config/automation/config/${encodeURIComponent(id)}`,
    );
  }
}
