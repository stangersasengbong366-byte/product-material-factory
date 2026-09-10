const CONFIG_ID = "course-material-studio-v1";
const MAX_BODY_BYTES = 6 * 1024 * 1024;

function corsHeaders() {
  return {
    // 素材工厂可从 Netlify、GitHub Pages 或本地打开；接口不使用 Cookie，
    // 因此允许跨域访问，让所有使用该工具的同事连接同一份云端配置。
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-Cloud-Revision",
    "Cache-Control": "no-store",
  };
}

function json(data, status = 200) {
  const headers = corsHeaders();
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
    const headers = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== "/api/studio-config") {
      return json({ message: "Not found" }, 404);
    }

    if (request.method === "GET") {
      const record = await env.STUDIO_DB
        .prepare("SELECT payload, updated_at, revision FROM studio_config WHERE id = ?")
        .bind(CONFIG_ID)
        .first();
      if (!record) return json({ message: "云端暂无素材配置" }, 404);

      try {
        return json({
          payload: JSON.parse(record.payload),
          updatedAt: record.updated_at,
          revision: record.revision,
        });
      } catch {
        return json({ message: "云端配置数据损坏，请重新保存" }, 500);
      }
    }

    if (request.method === "PUT") {
      const declaredSize = Number(request.headers.get("content-length") || 0);
      if (declaredSize > MAX_BODY_BYTES) {
        return json({ message: "配置数据超过 6MB，请精简上传内容后重试" }, 413);
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ message: "配置数据格式无效" }, 400);
      }

      if (!payload || !Array.isArray(payload.products)) {
        return json({ message: "配置中缺少产品列表，已拒绝覆盖云端数据" }, 400);
      }

      const current = await env.STUDIO_DB
        .prepare("SELECT payload, revision FROM studio_config WHERE id = ?")
        .bind(CONFIG_ID)
        .first();
      const expectedRevision = Number(request.headers.get("X-Cloud-Revision"));
      const incomingVersion = Number(payload.version);
      const updatedAt = new Date().toISOString();

      if (!current) {
        const result = await env.STUDIO_DB
          .prepare(
            "INSERT INTO studio_config (id, payload, updated_at, revision) VALUES (?, ?, ?, 1)",
          )
          .bind(CONFIG_ID, JSON.stringify(payload), updatedAt)
          .run();
        if (!result.success) return json({ message: "云端配置初始化失败，请重试" }, 500);
        return json({ saved: true, updatedAt, revision: 1 });
      }

      let savedVersion = null;
      try {
        savedVersion = Number(JSON.parse(current.payload).version);
      } catch {
        // 兼容早期没有版本号的云端记录：后续这次保存会补齐版本号。
      }
      const incomingIsNewer =
        Number.isFinite(incomingVersion) &&
        (!Number.isFinite(savedVersion) || incomingVersion > savedVersion);
      const revisionMatches =
        Number.isInteger(expectedRevision) && expectedRevision === current.revision;

      if (!revisionMatches && !incomingIsNewer) {
        return json({
          message: "云端已有更新更晚的版本，已保留最新版，请刷新页面查看",
          revision: current.revision,
        }, 409);
      }

      const result = await env.STUDIO_DB
        .prepare(
          `UPDATE studio_config
           SET payload = ?, updated_at = ?, revision = revision + 1
           WHERE id = ? AND revision = ?`,
        )
        .bind(JSON.stringify(payload), updatedAt, CONFIG_ID, current.revision)
        .run();
      if (result.meta.changes !== 1) {
        return json({
          message: "保存期间云端出现更新，请再次保存以按最新时间写入",
        }, 409);
      }
      return json({
        saved: true,
        updatedAt,
        revision: current.revision + 1,
        conflictResolvedByTime: !revisionMatches,
      });
    }

    return json({ message: "Method not allowed" }, 405);
  },
};
