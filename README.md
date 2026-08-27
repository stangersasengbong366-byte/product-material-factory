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

云端数据已迁移为 Netlify Functions + Netlify Blobs。部署到 Netlify 后无需配置数据库地址或密钥，站点会通过同源接口 `/api/studio-config` 自动读写长期保存的数据。

需要在本地联调云端接口时使用：

```bash
npm run dev:cloud
```

普通页面开发仍可使用 `npm run dev`；开发服务器会把 `/api` 请求代理到正式 Netlify 站点，方便将 localhost 中已有的数据直接保存到新云端。

如果前端和 Netlify API 分开部署，可在 `.env` 中指定：

```bash
VITE_CLOUD_API_URL=https://你的站点.netlify.app/api/studio-config
```
