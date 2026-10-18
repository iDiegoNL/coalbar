// Keep OS startup registration and persisted preferences consistent. Explicit
// login requests are always reapplied so a failed rollback can be retried.
function updatePreferences(current, patch, { setLogin, persist }) {
  const next = { ...current };
  for (const key of [
    "notifications",
    "launchAtLogin",
    "reduceMotion",
    "reduceTransparency",
  ])
    if (typeof patch?.[key] === "boolean") next[key] = patch[key];
  const loginRequested = typeof patch?.launchAtLogin === "boolean";
  if (loginRequested) setLogin(next.launchAtLogin);
  try {
    persist(next);
  } catch (error) {
    if (loginRequested) {
      try {
        setLogin(current.launchAtLogin);
      } catch {
        throw Error(
          "Preferences could not be saved, and launch at login could not be restored. The system startup setting may have changed. Retry setting Open at login to your preferred value.",
        );
      }
    }
    throw error;
  }
  return next;
}
module.exports = { updatePreferences };
