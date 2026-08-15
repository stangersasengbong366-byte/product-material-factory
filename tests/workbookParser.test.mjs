import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCourseWorkbook } from "../src/workbookParser.js";

const headers = [
  "年级",
  "季度",
  "早鸟期－上课\n日期",
  "早鸟期－上课\n时间",
  "一期-上课日期",
  "一期-上课时间",
  "二期-上课日期",
  "二期-上课时间",
  "三期-上课日期",
  "三期-上课时间",
  "课程大纲",
];

function makeSheet(subject) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["直播课底表"],
    headers,
    [
      "高一",
      "暑期",
      "2026/6/27",
      "15:30–16:30",
      "",
      "",
      "",
      "",
      "",
      "",
      `【${subject}】学习指南`,
    ],
    [
      "",
      "",
      "2026/7/1",
      "10:30–12:30",
      "2026/7/13",
      "15:30–17:30",
      "2026/7/25",
      "10:30–12:30",
      "2026/8/6",
      "15:30–17:30",
      `【${subject}】暑期第一讲`,
    ],
    [
      "",
      "秋季",
      "2026/8/29",
      "15:30–17:30",
      "",
      "",
      "",
      "",
      "",
      "",
      `【${subject}】秋季第一讲`,
    ],
  ]);
  sheet["!merges"] = [
    { s: { r: 2, c: 0 }, e: { r: 4, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
  ];
  return sheet;
}

function makeFile() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, makeSheet("语文"), "语文");
  XLSX.utils.book_append_sheet(workbook, makeSheet("数学"), "数学课表");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    name: "学法直播底表.xlsx",
    async arrayBuffer() {
      return buffer;
    },
  };
}

test("解析按科目 Sheet、合并年级季度和多期日期列", async () => {
  const parsed = await parseCourseWorkbook(makeFile(), "live");

  assert.deepEqual(parsed.summary.subjects, ["语文", "数学"]);
  assert.deepEqual(parsed.summary.grades, ["高一"]);
  assert.deepEqual(parsed.summary.quarters, ["暑期", "秋季"]);
  assert.equal(parsed.library.高一.语文.暑期.早鸟期.length, 2);
  assert.equal(parsed.library.高一.语文.暑期.一期.length, 1);
  assert.equal(parsed.library.高一.语文.暑期.二期.length, 1);
  assert.equal(parsed.library.高一.语文.暑期.三期.length, 1);
  assert.equal(parsed.library.高一.语文.秋季.早鸟期.length, 1);
  assert.equal(parsed.library.高一.语文.秋季.一期, undefined);
  assert.equal(
    parsed.library.高一.数学.暑期.一期[0].title,
    "【数学】暑期第一讲",
  );
});

function makeVideoFile() {
  const workbook = XLSX.utils.book_new();
  const header = [
    "模块",
    "视频大纲",
    "夏/秋/冬/春",
    "是否分层",
    "（1星/2星/3星/4星）",
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      header,
      ["阅读", "语文秋季课程", "秋季（一轮）", "否", "2星"],
      ["阅读", "语文寒假课程", "寒假（二轮）", "否", "3星"],
    ]),
    "高一语文",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      header,
      ["遗传", "生物寒假课程", "冬季", "否", "2星"],
    ]),
    "高一生物",
  );
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    name: "知识视频底表.xlsx",
    async arrayBuffer() {
      return buffer;
    },
  };
}

test("知识视频将寒假和冬季保留为独立课程阶段", async () => {
  const parsed = await parseCourseWorkbook(makeVideoFile(), "video");

  assert.equal(
    parsed.library.高一.语文.寒假.ordered[0].title,
    "语文寒假课程",
  );
  assert.equal(
    parsed.library.高一.生物.寒假.ordered[0].title,
    "生物寒假课程",
  );
  assert.equal(parsed.library.高一.语文.春季, undefined);
  assert.equal(
    parsed.summary.cells.find(
      (item) => item.subject === "语文" && item.quarter === "寒假",
    ).expected,
    20,
  );
});
