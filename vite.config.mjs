import { defineConfig } from "vite";
export default defineConfig({
  root: "desktop/renderer",
  base: "./",
  resolve: { alias: { "react-native": "react-native-web" } },
  build: { outDir: "../../dist/desktop", emptyOutDir: true },
});
