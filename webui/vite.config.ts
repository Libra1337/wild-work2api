import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: "./" 使产物使用相对路径，go:embed 后可在任意前缀下托管
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: {
    // 本地开发时代理到 wild-work 实例，避免跨域
    proxy: {
      "/api": "http://127.0.0.1:7863",
    },
  },
});
