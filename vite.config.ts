import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // `base` only matters for production builds deployed under
  // https://<user>.github.io/unfold/. In dev, keep it at `/` so the app
  // is reachable at http://localhost:5181/ without a path prefix.
  base: command === "build" ? "/unfold/" : "/",
  server: { port: 5181, strictPort: true },
}));
