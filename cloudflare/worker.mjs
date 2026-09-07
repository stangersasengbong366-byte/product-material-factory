const CONFIG_ID = "course-material-studio-v1";
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function allowedOrigins(env) {
  return new Set([
    env.APP_ORIGIN,
    "http://localhost:5173",
    "http://localhost:5174",
  ].filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).has(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin || env.APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(request, env, data, status = 200) {
  const headers = corsHeaders(request, env);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);
    if (!headers) return new Response("Forbidden", { status: 403 });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== "/api/studio-config") {
      return json(request, env, { message: "Not found" }, 404);
    }

    if (request.method === "GET") {
      const record = await env.STUDIO_DB
        .prepare("SELECT payload, updated_at FROM studio_config WHERE id = ?")
        .bind(CONFIG_ID)
        .first();
      if (!record) return json(request, env, { message: "云端暂无素材配置" }, 404);

      try {
        return json(request, env, {
          payload: JSON.parse(record.payload),
          updatedAt: record.updated_at,
        });
      } catch {
        return json(request, env, { message: "云端配置数据损坏，请重新保存" }, 500);
      }
    }

    if (request.method === "PUT") {
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > MAX_BODY_BYTES) {
        return json(request, env, { message: "配置数据超过 6MB，请精简上传内容后重试" }, 413);
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(request, env, { message: "配置数据格式无效" }, 400);
      }

      if (!payload || !Array.isArray(payload.products)) {
        return json(request, env, { message: "配置中缺少产品列表，已拒绝覆盖云端数据" }, 400);
      }

      const updatedAt = new Date().toISOString();
      await env.STUDIO_DB
        .prepare(
          `INSERT INTO studio_config (id, payload, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
        )
        .bind(CONFIG_ID, JSON.stringify(payload), updatedAt)
        .run();
      return json(request, env, { saved: true, updatedAt });
    }

    return json(request, env, { message: "Method not allowed" }, 405);
  },
};
