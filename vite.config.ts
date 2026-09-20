import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
