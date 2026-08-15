import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialTasks, getVideoRows } from "../src/productStore.js";

function stage(title, quarter) {
  const row = {
    no: 1,
    title,
    quarter,
    bucket: "common",
    module: "核心模块",
  };
  return {
    common: [row],
    target: [],
    elite: [],
    layered: [],
    ordered: [row],
  };
}

test("知识视频产出合并产品覆盖的秋季与寒假课程", () => {
  const product = {
    grade: "高一",
    coverageQuarters: ["秋季", "寒假"],
    live: {},
    gifts: {},
    priceConfig: { enabled: false },
    videoLibrary: {
      高一: {
        语文: {
          秋季: stage("秋季课程", "秋季"),
          寒假: stage("寒假课程", "寒假"),
        },
      },
    },
  };

  const rows = getVideoRows(product, "语文", "通用版");
  assert.deepEqual(
    rows.map((row) => [row.no, row.quarter, row.title]),
    [
      [1, "秋季", "秋季课程"],
      [2, "寒假", "寒假课程"],
    ],
  );
  assert.equal(
    buildMaterialTasks(product).find((task) => task.type === "知识视频")
      .count,
    2,
  );
});
