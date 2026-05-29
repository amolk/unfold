/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // `base` only matters for production builds deployed under
  // https://<user>.github.io/unfold/. In dev, keep it at `/` so the app
  // is reachable at http://localhost:5181/ without a path prefix.
  base: command === "build" ? "/unfold/" : "/",
  server: { port: 5181, strictPort: true },
  // Headless unit tests (Node env — the engine/builders are pure and the GPU
  // mirrors are plain Float32Arrays until uploaded, so no DOM/WebGL needed).
  test: { environment: "node", include: ["src/**/*.test.ts"] },
}));
