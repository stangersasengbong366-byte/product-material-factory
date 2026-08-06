import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 本地开发复用同一组织的 Supabase 环境配置；部署时仍可直接设置 VITE_* 环境变量。
  envDir: "../有道领世 产品权益",
});
