import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

// Version shown in the UI: the VERSION file (kept in sync with git tags by scripts/release.sh).
const version = (() => { try { return readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim(); } catch { return "dev"; } })();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Leaderboard API; in compose the dev service points this at api-dev.
      '/api': { target: process.env.API_URL || 'http://localhost:3002', changeOrigin: true },
    },
  },
  build: {
    target: 'esnext',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
