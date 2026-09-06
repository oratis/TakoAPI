import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. There is no database in CI or on a dev machine, so every test
// must stay pure — units that touch Postgres mock "@/lib/prisma" instead. That is
// also why the environment is "node" and no Next/React runtime is loaded: these
// tests cover src/lib logic (billing maths, SSRF guards, classification, URL
// safety), not rendering.
export default defineConfig({
  resolve: {
    // Mirrors the "@/*" -> "./src/*" path mapping in tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // Mock call history is reset between tests; implementations are set per test
    // so a leaked stub can't make an unrelated test pass.
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
