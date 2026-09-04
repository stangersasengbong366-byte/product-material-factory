import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseCourseWorkbook } from "../src/workbookParser.js";
import { getVideoRows } from "../src/productStore.js";

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

function makeSheet(subject, { headerless = false } = {}) {
  const dataRows = [
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
      "同早鸟期",
      "",
      "",
      "",
      "",
      "",
      `【${subject}】秋季第一讲`,
    ],
    [
      "",
      "",
      "2026/9/5",
      "15:30–17:30",
      "",
      "",
      "",
      "",
      "",
      "",
      `【${subject}】秋季第二讲`,
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(
    headerless ? dataRows : [["直播课底表"], headers, ...dataRows],
  );
  if (!headerless)
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
  XLSX.utils.book_append_sheet(
    workbook,
    makeSheet("生物", { headerless: true }),
    "生 物－课表",
  );
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

  assert.deepEqual(parsed.summary.subjects, ["语文", "数学", "生物"]);
  assert.deepEqual(parsed.summary.grades, ["高一"]);
  assert.deepEqual(parsed.summary.quarters, ["暑期", "秋季"]);
  assert.equal(parsed.library.高一.语文.暑期.早鸟期.length, 2);
  assert.equal(parsed.library.高一.语文.暑期.一期.length, 1);
  assert.equal(parsed.library.高一.语文.暑期.二期.length, 1);
  assert.equal(parsed.library.高一.语文.暑期.三期.length, 1);
  assert.equal(parsed.library.高一.语文.秋季.早鸟期.length, 2);
  assert.equal(parsed.library.高一.语文.秋季.一期.length, 2);
  assert.equal(
    parsed.library.高一.数学.暑期.一期[0].title,
    "【数学】暑期第一讲",
  );
  assert.equal(
    parsed.library.高一.生物.秋季.早鸟期[0].title,
    "【生物】秋季第一讲",
  );
  assert.equal(parsed.library.高一.生物.秋季.一期.length, 2);
  assert.equal(
    parsed.library.高一.生物.秋季.一期[1].title,
    "【生物】秋季第二讲",
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

test("知识视频向下继承合并模块的分值且不跨模块串值", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "模块",
      "视频大纲",
      "是否分层",
      "（1星/2星/3星/4星）",
      "（夏/秋/冬/春）",
      "涉及知识所占高考分值及题型",
    ],
    ["函数", "函数概念", "否", "1星", "秋季", "约10分"],
    ["", "函数定义域", "否", "2星", "秋季", ""],
    ["不等式", "不等式性质", "否", "1星", "秋季", ""],
  ]);
  sheet["!merges"] = [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 5 }, e: { r: 2, c: 5 } },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "高一数学");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const parsed = await parseCourseWorkbook(
    {
      name: "合并分值知识视频底表.xlsx",
      async arrayBuffer() {
        return buffer;
      },
    },
    "video",
  );
  const rows = parsed.library.高一.数学.秋季.ordered;
  assert.deepEqual(
    rows.map((row) => [row.title, row.module, row.scoreShare]),
    [
      ["函数概念", "函数", "约10分"],
      ["函数定义域", "函数", "约10分"],
      ["不等式性质", "不等式", ""],
    ],
  );
});

function makeTrackedVideoFile() {
  const workbook = XLSX.utils.book_new();
  const header = [
    "模块",
    "视频大纲",
    "是否分层",
    "（1星/2星/3星/4星）",
    "（夏/秋/冬/春）",
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      header,
      ["函数", "秋季通用课", "通用", "2星", "秋季（一轮）"],
      ["函数", "秋季目标专属课", "目标", "3星", "秋季（一轮）"],
      ["函数", "春季通用课", "通用", "2星", "春季（二轮）"],
      [
        "函数",
        "春季目标差异课",
        "目标+菁英2个班型不同",
        "3星",
        "春季（二轮）",
      ],
    ]),
    "高三-数学-目标",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      header,
      ["函数", "秋季通用课", "通用", "2星", "秋季（一轮）"],
      ["函数", "秋季菁英专属课", "菁英", "4星", "秋季（一轮）"],
      ["函数", "春季通用课", "通用", "2星", "春季（二轮）"],
      [
        "函数",
        "春季菁英差异课",
        "目标+菁英2个班型不同",
        "4星",
        "春季（二轮）",
      ],
    ]),
    "高三-数学-菁英",
  );
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    name: "双班型知识视频底表.xlsx",
    async arrayBuffer() {
      return buffer;
    },
  };
}

test("目标班与菁英班分 Sheet 时分别保留专属课程和原表顺序", async () => {
  const parsed = await parseCourseWorkbook(makeTrackedVideoFile(), "video");
  const makeProduct = (quarter) => ({
    grade: "高三",
    coverageQuarters: [quarter],
    videoLibrary: parsed.library,
  });

  assert.deepEqual(
    getVideoRows(makeProduct("秋季"), "数学", "目标班").map(
      (row) => row.title,
    ),
    ["秋季通用课", "秋季目标专属课"],
  );
  assert.deepEqual(
    getVideoRows(makeProduct("秋季"), "数学", "菁英班").map(
      (row) => row.title,
    ),
    ["秋季通用课", "秋季菁英专属课"],
  );
  assert.deepEqual(
    getVideoRows(makeProduct("春季"), "数学", "目标班").map(
      (row) => row.title,
    ),
    ["春季通用课", "春季目标差异课"],
  );
  assert.deepEqual(
    getVideoRows(makeProduct("春季"), "数学", "菁英班").map(
      (row) => row.title,
    ),
    ["春季通用课", "春季菁英差异课"],
  );
  const autumn = parsed.summary.cells.find(
    (item) => item.grade === "高三" && item.quarter === "秋季",
  );
  assert.equal(autumn.targetSource, "高三-数学-目标");
  assert.equal(autumn.eliteSource, "高三-数学-菁英");
  assert.equal(autumn.targetLessons, 2);
  assert.equal(autumn.eliteLessons, 2);
});
