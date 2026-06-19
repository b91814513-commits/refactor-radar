import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy charting/graphing vendors into their own chunks so
        // they can be cached and loaded on demand alongside the lazy tabs.
        manualChunks: {
          recharts: ["recharts"],
          "d3-force": ["d3-force"]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
