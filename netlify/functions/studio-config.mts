import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const STORE_NAME = "course-material-studio";
const CONFIG_KEY = "studio/config-v1";
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async function handler(request: Request, _context: Context) {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (request.method === "GET") {
    const record = await store.get(CONFIG_KEY, { type: "json" });
    return record ? json(record) : json({ message: "云端暂无素材配置" }, 404);
  }

  if (request.method === "PUT") {
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > MAX_BODY_BYTES) {
      return json({ message: "配置数据超过 6MB，请精简上传内容后重试" }, 413);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return json({ message: "配置数据格式无效" }, 400);
    }

    if (!payload || !Array.isArray(payload.products)) {
      return json({ message: "配置中缺少产品列表，已拒绝覆盖云端数据" }, 400);
    }

    const record = {
      payload,
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(CONFIG_KEY, record, {
      metadata: { updatedAt: record.updatedAt, version: String(payload.version || "") },
    });
    return json({ saved: true, updatedAt: record.updatedAt });
  }

  return json({ message: "Method not allowed" }, 405);
}

export const config: Config = {
  path: "/api/studio-config",
  method: ["GET", "PUT"],
};
