import assert from "node:assert/strict";
import test from "node:test";
import {
  getTaskFilename,
  normalizeExportTrack,
  sanitizeFilenamePart,
} from "../src/exportNaming.js";

const product = {
  name: "秋冬衔接卡",
  grade: "高二",
};

test("知识视频文件名区分目标班与菁英班", () => {
  const target = getTaskFilename(product, {
    subject: "数学",
    type: "知识视频",
    track: "目标班",
  });
  const elite = getTaskFilename(product, {
    subject: "数学",
    type: "知识视频",
    track: "菁英班",
  });

  assert.equal(target, "秋冬衔接卡_高二_数学_知识视频_目标班.png");
  assert.equal(elite, "秋冬衔接卡_高二_数学_知识视频_菁英班.png");
  assert.notEqual(target, elite);
});

test("旧精英班命名自动修正且非法文件名字符被替换", () => {
  assert.equal(normalizeExportTrack("精英班"), "菁英班");
  assert.equal(sanitizeFilenamePart('高二/数学:目标班'), "高二-数学-目标班");
});
