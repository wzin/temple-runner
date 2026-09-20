import { defineConfig } from "vitest/config";

export default defineConfig({
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
