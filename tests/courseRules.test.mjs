import assert from "node:assert/strict";
import test from "node:test";
import { expectedVideoLessonCount } from "../src/courseRules.js";

test("高三知识视频按六十节和文综三十节校验", () => {
  assert.equal(expectedVideoLessonCount("数学", "秋季", "高三"), 60);
  assert.equal(expectedVideoLessonCount("物理", "春季", "高三"), 60);
  assert.equal(expectedVideoLessonCount("历史", "秋季", "高三"), 30);
  assert.equal(expectedVideoLessonCount("数学", "寒假", "高三"), 20);
});

test("高一现有知识视频数量规则保持不变", () => {
  assert.equal(expectedVideoLessonCount("数学", "秋季", "高一"), 40);
  assert.equal(expectedVideoLessonCount("数学", "寒假", "高一"), 20);
  assert.equal(expectedVideoLessonCount("历史", "春季", "高一"), 20);
});
