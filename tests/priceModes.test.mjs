import assert from "node:assert/strict";
import test from "node:test";
import { getPriceTierCounts } from "../src/priceModes.js";
import { buildMaterialTasks, normalizeProduct } from "../src/productStore.js";

test("新增两个非文综去六科价格版本", () => {
  const product = normalizeProduct({
    id: "price-no-six",
    name: "秋冬衔接卡",
    grade: "高二",
    stage: "秋冬衔接卡",
    priceConfig: { enabled: true, wenZongMode: "deal" },
  });
  const tasks = buildMaterialTasks(product).filter(
    (task) => task.type === "价格",
  );

  assert.equal(tasks.length, 5);
  assert.deepEqual(
    tasks.map((task) => task.priceMode),
    [
      "nonWenZong",
      "nonWenZongNoSingle",
      "nonWenZongNoSix",
      "nonWenZongNoSingleNoSix",
      "wenZong",
    ],
  );
});

test("去六科版本分别保留一至五科和两至五科", () => {
  assert.deepEqual(getPriceTierCounts("nonWenZongNoSix"), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPriceTierCounts("nonWenZongNoSingleNoSix"), [2, 3, 4, 5]);
});
