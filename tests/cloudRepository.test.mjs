import assert from "node:assert/strict";
import test from "node:test";
import { saveCloudStudio } from "../src/cloudRepository.js";

test("云端版本冲突时读取最新版本并自动重试一次", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(options);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "云端配置已被更新" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (calls.length === 2) {
      return new Response(
        JSON.stringify({ payload: { products: [] }, revision: 7 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ revision: 8 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await saveCloudStudio(
      { products: [{ id: "latest" }] },
      { revision: 6 },
    );
    assert.equal(result.revision, 8);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].headers["X-Cloud-Revision"], "7");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
