import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

// Library build — produces the publishable npm package in dist/:
//   dist/index.js     ESM bundle of src/lib
//   dist/index.d.ts   bundled type declarations (entryRoot = src/lib)
// The demo SPA build is separate (vite.config.ts → dist-site/, for GitHub
// Pages). React + the three.js / react-three ecosystem are externalized so the
// consumer brings their own (see peerDependencies in package.json).
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src/lib"],
      exclude: ["src/**/*.test.*"],
      entryRoot: "src/lib",
      outDir: "dist",
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("src/lib/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // Bare specifiers for the peers (and their subpaths, e.g. three/examples,
      // react/jsx-runtime) stay external; our own relative imports do not match.
      external: (id) =>
        /^(react|react-dom|three|postprocessing|@react-three\/)/.test(id),
    },
  },
});
