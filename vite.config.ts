import { defineConfig } from "vitest/config";

const repoBase = "/physics-playground/";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "1" ? repoBase : "/",
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
