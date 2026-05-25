import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["neuronpress.qzz.io"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), splitVendorChunkPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@clerk") || id.includes("convex")) return "backend";
          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("rehype-") || id.includes("highlight.js")) {
            return "markdown";
          }
          if (id.includes("recharts") || id.includes("d3-") || id.includes("react-smooth")) return "charts";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "ui";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react") || id.includes("scheduler")) return "react";
        },
      },
    },
  },
}));
