// Idempotently place CoalBar next to the tray on the panel containing it.
var target = panels().filter(function (panel) {
  return panel.widgets().some(function (widget) {
    return widget.type === "org.kde.plasma.systemtray";
  });
})[0];
if (!target)
  throw new Error(
    "No panel with a system tray found. Add CoalBar using Add Widgets.",
  );
var existing = target.widgets().filter(function (widget) {
  return widget.type === "local.coalbar.panel";
})[0];
if (!existing) {
  var tray = target.widgets().filter(function (widget) {
    return widget.type === "org.kde.plasma.systemtray";
  })[0];
  var widget = target.addWidget("local.coalbar.panel");
  widget.index = tray.index;
  print("Added CoalBar to panel " + target.id);
} else print("CoalBar is already on panel " + target.id);
