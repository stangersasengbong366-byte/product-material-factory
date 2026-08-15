import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialTasks, normalizeProduct } from "../src/productStore.js";

test("学法直播全年库缺科时仍展示生物待补充任务", () => {
  const product = normalizeProduct({
    id: "live-subjects",
    name: "秋冬衔接卡",
    grade: "高一",
    stage: "秋冬衔接卡",
    coverageQuarters: ["秋季"],
    liveLibrary: {
      高一: {
        数学: {
          秋季: {
            一期: [{ title: "函数", date: "9月1日", time: "19:00" }],
          },
        },
      },
    },
    priceConfig: { enabled: false },
  });

  const liveTasks = buildMaterialTasks(product).filter(
    (task) => task.type === "学法直播",
  );
  const biology = liveTasks.find((task) => task.subject === "生物");

  assert.equal(liveTasks.length, 9);
  assert.deepEqual(biology, {
    id: "生物-live",
    subject: "生物",
    type: "学法直播",
    track: "待补充课表",
    count: 0,
  });
});
