/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "docs", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
