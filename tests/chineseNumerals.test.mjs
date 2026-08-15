import assert from "node:assert/strict";
import test from "node:test";
import { toChineseNumeral } from "../src/chineseNumerals.js";

test("知识视频章节序号在十以后继续使用中文数字", () => {
  assert.equal(toChineseNumeral(1), "一");
  assert.equal(toChineseNumeral(10), "十");
  assert.equal(toChineseNumeral(11), "十一");
  assert.equal(toChineseNumeral(12), "十二");
  assert.equal(toChineseNumeral(20), "二十");
  assert.equal(toChineseNumeral(21), "二十一");
});

test("中文章节序号支持较多模块并正确补零", () => {
  assert.equal(toChineseNumeral(99), "九十九");
  assert.equal(toChineseNumeral(101), "一百零一");
  assert.equal(toChineseNumeral(1010), "一千零一十");
});
