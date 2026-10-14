import assert from "node:assert/strict";
import test from "node:test";
import {
  saveCloudProduct,
  saveCloudStudio,
} from "../src/cloudRepository.js";

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

test("单个产品保存只上传当前产品，并在冲突后按最新版本重试", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options = {}) => {
    calls.push(options);
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "版本冲突" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (calls.length === 2) {
      return new Response(
        JSON.stringify({ payload: { products: [] }, revision: 12 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ revision: 13 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await saveCloudProduct(
      { id: "product-new", name: "新产品" },
      { revision: 11 },
    );
    assert.equal(result.revision, 13);
    assert.equal(calls[0].method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].body), {
      operation: "upsert-product",
      product: { id: "product-new", name: "新产品" },
    });
    assert.equal(calls[2].headers["X-Cloud-Revision"], "12");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
