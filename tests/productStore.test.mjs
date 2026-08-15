import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMaterialTasks,
  getVideoRows,
  normalizeProduct,
} from "../src/productStore.js";

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

test("精英班旧数据统一展示为菁英班并保留知识视频母版修改", () => {
  const product = normalizeProduct({
    id: "elite-video",
    name: "高一秋冬衔接卡",
    grade: "高一",
    stage: "秋冬衔接卡",
    coverageQuarters: ["秋季"],
    videoTrack: "精英班",
    videoLibrary: {
      高一: {
        数学: {
          秋季: {
            common: [],
            target: [],
            elite: [
              {
                title: "集合进阶",
                module: "集合",
                difficulty: "3星",
                bucket: "elite",
              },
            ],
            layered: [],
          },
        },
      },
    },
    videoTemplateOverride: {
      headline: "可修改的知识视频宣传语",
      pages: {
        "数学::精英班": {
          track: "精英班",
          rows: [
            {
              no: 1,
              title: "修改后的课程",
              module: "修改后的模块",
              scoreShare: "约10分",
              difficulty: "★★★★",
              layer: "菁英班",
            },
          ],
        },
      },
    },
    priceConfig: { enabled: false },
  });

  const videoTasks = buildMaterialTasks(product).filter(
    (task) => task.type === "知识视频",
  );
  assert.equal(product.videoTrack, "菁英班");
  assert.equal(videoTasks[0].track, "菁英班");
  assert.equal(product.videoTemplateOverride.headline, "可修改的知识视频宣传语");
  assert.equal(
    product.videoTemplateOverride.pages["数学::菁英班"].track,
    "菁英班",
  );
  assert.equal(
    product.videoTemplateOverride.pages["数学::菁英班"].rows[0].title,
    "修改后的课程",
  );
});
