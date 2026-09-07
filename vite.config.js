import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS
    ? "/product-material-factory/"
    : "/",
  // 本地开发仍可复用同一工作区的非敏感 VITE_* 配置。
  envDir: "../有道领世 产品权益",
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_CLOUD_API_ORIGIN || "https://youdao-course-material-storage.workers.dev",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
