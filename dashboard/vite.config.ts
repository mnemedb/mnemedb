import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Multi-page setup so /docs and /buy each get their own real HTML entry
// (so the Qwerti widget script lives in /buy's <head> with data-auto-open,
// while the marketing root just loads the widget without auto-popping).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main:     resolve(__dirname, "index.html"),
        docs:     resolve(__dirname, "docs/index.html"),
        buy:      resolve(__dirname, "buy/index.html"),
        metamask: resolve(__dirname, "metamask/index.html"),
        crystal:  resolve(__dirname, "m/index.html"),
      },
    },
  },
});
