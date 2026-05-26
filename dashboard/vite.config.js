import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
// Multi-page setup so /docs gets its own real HTML entry (with the same
// hashed JS bundle inlined correctly). Without this, /docs would either
// 404 or load a hand-rolled HTML that points at the dev /src/main.tsx
// path (which doesn't exist in production builds).
export default defineConfig({
    plugins: [react()],
    server: { port: 5173 },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                docs: resolve(__dirname, "docs/index.html"),
            },
        },
    },
});
