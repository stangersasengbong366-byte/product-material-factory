import assert from "node:assert/strict";
import test from "node:test";
import { formatCourseDate } from "../src/dateFormat.js";

test("将月/日/两位年份转换成年/月/日", () => {
  assert.equal(formatCourseDate("10/17/26"), "2026/10/17");
  assert.equal(formatCourseDate("1/29/27"), "2027/1/29");
});

test("统一常见日期格式且保留非日期说明", () => {
  assert.equal(formatCourseDate("2026-10-17"), "2026/10/17");
  assert.equal(formatCourseDate("2026年10月17日"), "2026/10/17");
  assert.equal(formatCourseDate("以排课为准"), "以排课为准");
  assert.equal(formatCourseDate(""), "");
});
