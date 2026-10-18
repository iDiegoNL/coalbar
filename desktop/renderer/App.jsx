import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
} from "react-native";
import "./style.css";
const bridge = window.coalbar;
async function call(action, payload) {
  const result = await bridge.invoke(action, payload);
  if (!result.ok) throw Error(result.error);
  return result.value;
}
function Button({ children, onPress, disabled = false, primary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, primary && s.primary, disabled && { opacity: 0.45 }]}
    >
      <Text style={s.buttonText}>{children}</Text>
    </Pressable>
  );
}
function Label({ children }) {
  return <Text style={s.label}>{children}</Text>;
}
function Toggle({ label, value, onValueChange }) {
  return (
    <View style={s.row}>
      <Text style={s.body}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={!!value}
        onValueChange={onValueChange}
        trackColor={{ true: "#e78a50" }}
      />
    </View>
  );
}
function Entity({ label, value, onChange, entities, prefixes }) {
  const matches = entities.filter((e) =>
    prefixes.some((p) => e.entity_id.startsWith(p)),
  );
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      {matches.length ? (
        <select
          aria-label={label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">None selected</option>
          {value && !matches.some((e) => e.entity_id === value) && (
            <option value={value}>{value}</option>
          )}
          {matches.map((e) => (
            <option key={e.entity_id} value={e.entity_id}>
              {e.attributes.friendly_name || e.entity_id} — {e.entity_id}
            </option>
          ))}
        </select>
      ) : (
        <TextInput
          accessibilityLabel={label}
          style={s.input}
          value={value || ""}
          onChangeText={onChange}
          placeholder="Entity ID"
          placeholderTextColor="#85898c"
        />
      )}
    </View>
  );
}
function Settings({ state, act }) {
  const [draft, setDraft] = useState(state.config),
    [token, setToken] = useState(""),
    [entities, setEntities] = useState(state.entities),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false);
  const field = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  async function run(fn) {
    setLoading(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }
  const preference = (key, value) =>
    run(() => call("preferences", { [key]: value }));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.settings}>
      <View style={s.row}>
        <View>
          <Text style={s.title}>CoalBar</Text>
          <Text style={s.muted}>A little reminder for a better session.</Text>
        </View>
        <Button onPress={() => act("demo", !state.demo)}>
          {state.demo ? "Stop demo" : "Try demo"}
        </Button>
      </View>
      <View style={s.card}>
        <Text style={s.section}>Home Assistant</Text>
        <Label>Server URL</Label>
        <TextInput
          accessibilityLabel="Server URL"
          style={s.input}
          value={draft.url}
          onChangeText={(v) => {
            field("url", v);
            setEntities([]);
          }}
          autoCapitalize="none"
        />
        <Label>Long-lived access token</Label>
        <TextInput
          accessibilityLabel="Long-lived access token"
          secureTextEntry
          style={s.input}
          value={token}
          onChangeText={setToken}
          placeholder={
            state.hasToken
              ? "Saved securely · leave blank to keep"
              : "Paste access token"
          }
          placeholderTextColor="#85898c"
          autoCapitalize="none"
        />
        <Text style={s.muted}>
          Create a token in your Home Assistant profile → Security. Stored
          encrypted using your operating system’s credential protection.
        </Text>
        <Button
          disabled={loading}
          onPress={() =>
            run(async () => {
              setEntities(await call("discover", { url: draft.url, token }));
              setMessage(
                "Connected. Select your heater and automations below.",
              );
            })
          }
        >
          {loading ? "Working…" : "Connect & find entities"}
        </Button>
      </View>
      <View style={s.card}>
        <Text style={s.section}>Your heater</Text>
        <Entity
          label="Smart plug"
          value={draft.plug}
          onChange={(v) => field("plug", v)}
          entities={entities}
          prefixes={["switch.", "input_boolean."]}
        />
        <Entity
          label="Heating automation"
          value={draft.heatingAutomation}
          onChange={(v) => field("heatingAutomation", v)}
          entities={entities}
          prefixes={["automation."]}
        />
        <Entity
          label="Fresh-coal automation"
          value={draft.reminderAutomation}
          onChange={(v) => field("reminderAutomation", v)}
          entities={entities}
          prefixes={["automation."]}
        />
        <Text style={s.accent}>{state.timingSummary}</Text>
        <Text style={s.muted}>
          Timings refresh every minute. Flip reminders happen halfway through
          heating. Home Assistant controls the heater.
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.section}>Desktop preferences</Text>
        <Toggle
          label="Desktop notifications"
          value={state.preferences.notifications}
          onValueChange={(v) => preference("notifications", v)}
        />
        <Text style={s.muted}>
          {state.notificationSupported
            ? "Delivery depends on system notification and Do Not Disturb settings."
            : "Desktop notifications are unavailable on this system."}
        </Text>
        <Button onPress={() => act("testNotification")}>
          Test notification
        </Button>
        <Toggle
          label="Open at login"
          value={state.preferences.launchAtLogin}
          onValueChange={(v) => preference("launchAtLogin", v)}
        />
        <Toggle
          label="Reduce motion"
          value={state.preferences.reduceMotion}
          onValueChange={(v) => preference("reduceMotion", v)}
        />
        <Toggle
          label="Reduce transparency"
          value={state.preferences.reduceTransparency}
          onValueChange={(v) => preference("reduceTransparency", v)}
        />
        <Text style={s.muted}>
          The tray icon hides when Home Assistant is unreachable. Reopen CoalBar
          to access Settings. Linux desktops need system tray support.
        </Text>
      </View>
      {(!state.secureStorage || state.startupError) && (
        <Text role="alert" style={s.accent}>
          {state.startupError ||
            "Secure credential storage is unavailable. Unlock your system keyring and restart CoalBar."}
        </Text>
      )}
      <Text role="status" style={s.body}>
        {message || state.status}
      </Text>
      <View style={s.row}>
        <Button onPress={() => act("quit")}>Quit</Button>
        <Button
          primary
          disabled={loading}
          onPress={() =>
            run(async () => {
              await call("save", { config: draft, token });
              setToken("");
              setMessage("Settings saved. Connecting…");
            })
          }
        >
          Save & connect
        </Button>
      </View>
    </ScrollView>
  );
}
function Heater({ active, paused }) {
  return (
    <div
      aria-hidden="true"
      className={`heater ${active ? "active" : ""} ${paused ? "paused" : ""}`}
    >
      <div className="heat">
        <i />
        <i />
        <i />
      </div>
      <div className="coals">
        <i />
        <i />
        <i />
      </div>
      <div className="stove">
        <b />
      </div>
    </div>
  );
}
function Panel({ state, act }) {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const listener = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);
  const display = state.presentation;
  return (
    <View style={s.panel}>
      <View style={s.row}>
        <Text style={s.brand}>COALBAR</Text>
        <Text style={s.muted}>
          {state.demo ? "DEMO" : state.reachable ? "CONNECTED" : "OFFLINE"}
        </Text>
      </View>
      <Heater
        active={display.heating}
        paused={!visible || state.preferences.reduceMotion}
      />
      <Text style={s.headline}>{state.headline}</Text>
      <Text style={s.clock}>{display.clock}</Text>
      <Text style={s.muted}>{display.subtitle}</Text>
      {display.progress != null && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(100 * display.progress),
          }}
          style={s.track}
        >
          <View style={[s.progress, { width: `${100 * display.progress}%` }]} />
        </View>
      )}
      <View style={{ flex: 1 }} />
      {state.notice && (
        <View style={s.notice}>
          <Text style={[s.body, { flex: 1 }]}>{display.noticeText}</Text>
          <Button onPress={() => act("dismiss")}>Got it</Button>
        </View>
      )}
      {state.demo && (
        <View style={s.demo}>
          {["flip", "ready", "fresh"].map((t) => (
            <Button key={t} onPress={() => act("preview", t)}>
              {t === "fresh" ? "New coals" : t}
            </Button>
          ))}
          <Button onPress={() => act("demo", false)}>End</Button>
        </View>
      )}
      <View style={s.footer}>
        <Button onPress={() => act("settings")}>Settings</Button>
        <Button onPress={() => act("quit")}>Quit</Button>
      </View>
    </View>
  );
}
function App() {
  const [state, setState] = useState(null),
    [error, setError] = useState("");
  const act = async (action, payload) => {
    try {
      await call(action, payload);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    const unsubscribe = bridge.subscribe(setState);
    call("state")
      .then(setState)
      .catch((e) => setError(e.message));
    const key = (e) => {
      if (e.key === "Escape") void act("hide");
    };
    window.addEventListener("keydown", key);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", key);
    };
  }, []);
  if (!state) return <Text style={s.body}>{error || "Starting CoalBar…"}</Text>;
  return (
    <div className={state.preferences.reduceTransparency ? "solid" : ""}>
      {location.hash === "#settings" ? (
        <Settings state={state} act={act} />
      ) : (
        <Panel state={state} act={act} />
      )}{" "}
      {error && (
        <Text role="alert" style={s.error}>
          {error}
        </Text>
      )}
    </div>
  );
}
const s = StyleSheet.create({
  screen: { height: "100vh", backgroundColor: "#151719" },
  settings: { padding: 26, gap: 18 },
  panel: { height: "100vh", padding: 24, backgroundColor: "#151719", gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 30, fontWeight: "700", color: "#fff" },
  body: { fontSize: 13, color: "#e2e3e4", lineHeight: 20 },
  muted: { fontSize: 12, color: "#a5a9ad", lineHeight: 18 },
  accent: { fontSize: 12, color: "#ffa56b", lineHeight: 19 },
  label: { fontSize: 12, color: "#bfc3c6", marginTop: 5 },
  card: { backgroundColor: "#202326", padding: 18, borderRadius: 16, gap: 12 },
  section: { color: "#fff", fontSize: 16, fontWeight: "600" },
  field: { gap: 6 },
  input: {
    color: "#fff",
    backgroundColor: "#131517",
    borderColor: "#42464b",
    borderWidth: 1,
    borderRadius: 7,
    padding: 10,
    fontSize: 14,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#303437",
  },
  primary: { backgroundColor: "#9b4c20" },
  buttonText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  brand: { color: "#b7babc", fontSize: 11, letterSpacing: 3 },
  headline: {
    color: "#e7e9ea",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
  },
  clock: {
    color: "#fff",
    fontSize: 39,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginTop: 4,
  },
  track: { height: 3, backgroundColor: "#39322d", marginTop: 14 },
  progress: { height: 3, backgroundColor: "#ee965f" },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#39291f",
  },
  demo: { flexDirection: "row", gap: 4, marginTop: 8 },
  footer: {
    borderTopWidth: 1,
    borderColor: "#34383b",
    paddingTop: 12,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  error: { backgroundColor: "#6f2525", color: "#fff", padding: 12 },
});
createRoot(document.getElementById("root")).render(<App />);
