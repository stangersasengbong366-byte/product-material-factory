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

复制 `.env.example` 为 `.env`，配置 Supabase 项目地址和匿名密钥：

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`.env` 不会提交到仓库。
