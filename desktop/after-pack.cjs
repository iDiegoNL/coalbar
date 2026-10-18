const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async ({ electronPlatformName, appOutDir }) => {
  if (electronPlatformName !== "linux") return;
  const launcher = path.join(appOutDir, "coalbar");
  await fs.rename(launcher, path.join(appOutDir, "coalbar-bin"));
  await fs.copyFile(path.join(__dirname, "linux-launcher.sh"), launcher);
  await fs.chmod(launcher, 0o755);
};
