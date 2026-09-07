# 产品素材工厂

面向课程产品运营的 React + Vite 素材生产工具，用于配置产品课程数据并生成学法直播、知识视频、赠课和价格长图。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

## 云端配置

云端数据使用 Cloudflare Worker + D1 保存。D1 只存一份产品、课程库与赠课映射配置，Worker 提供 `/api/studio-config` 的读写接口。

需要在本地联调云端接口时使用：

```bash
npm run dev:cloud
```

普通页面开发仍可使用 `npm run dev`；开发服务器会把 `/api` 请求代理到 Cloudflare Worker，方便将 localhost 中已有的数据直接保存到云端。

首次迁移时，如果 Cloudflare 尚无配置且页面运行在 localhost，系统会自动将浏览器中现有的本地产品配置写入云端；正式站点不会用示例数据自动覆盖云端。

如果前端与 Cloudflare Worker 分开部署，可在 `.env` 中指定：

```bash
VITE_CLOUD_API_URL=https://你的-worker.workers.dev/api/studio-config
```
