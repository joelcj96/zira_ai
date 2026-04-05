import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: ROOT_DIR,
  test: {
    environment: "node",
    include: ["src/test/**/*.test.js"]
  }
});
