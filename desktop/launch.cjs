const { spawn } = require("node:child_process");
const electron = require("electron");
const args = process.argv.slice(2);
if (
  process.platform === "linux" &&
  process.env.DISPLAY &&
  !args.some((a) => a.startsWith("--ozone-platform="))
)
  args.unshift("--ozone-platform=x11");
const child = spawn(electron, args, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
