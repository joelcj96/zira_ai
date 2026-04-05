import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: ROOT_DIR,
  plugins: [react()],
  server: {
    port: 5173
  },
  test: {
    root: ROOT_DIR,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: true
  }
});
