import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // proxy: {
    //   "/server": {
    //     target: "http://localhost:3001",
    //     changeOrigin: true,
    //     rewrite: (path) => path.replace(/^\/server/, ""),
    //   },
    // },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
