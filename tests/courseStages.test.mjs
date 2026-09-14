import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCourseStage,
  formatCourseStages,
  sortCourseQuarters,
} from "../src/courseStages.js";

test("课程阶段统一按暑秋寒春排序", () => {
  assert.deepEqual(
    sortCourseQuarters(["春季", "秋季", "暑期", "寒假"]),
    ["暑期", "秋季", "寒假", "春季"],
  );
});

test("高三阶段显示为一轮暑秋、二轮寒春", () => {
  assert.equal(
    formatCourseStages("高三", ["春季", "暑期", "寒假", "秋季"]),
    "一轮·暑 + 一轮·秋 + 二轮·寒 + 二轮·春",
  );
  assert.equal(formatCourseStage("高二", "暑期"), "暑期");
});
