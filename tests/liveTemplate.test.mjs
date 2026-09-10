import assert from "node:assert/strict";
import test from "node:test";
import {
  livePageKey,
  liveRowKey,
  normalizeLiveTemplateOverride,
  updateLiveTemplateOverride,
} from "../src/liveTemplate.js";
import {
  getLiveRows,
  loadProduct,
  normalizeProduct,
  saveProduct,
} from "../src/productStore.js";

const chinesePage = livePageKey({ grade: "高三" }, "语文");
const biologyPage = livePageKey({ grade: "高三" }, "生物");
const lessonKey = liveRowKey({ no: 1, title: "诗歌阅读" }, 0);

test("学法直播母版只保留显示字段，容忍无效历史数据并保留空字和数字零", () => {
  for (const value of [null, undefined, false, "文字", 1, []]) {
    assert.deepEqual(normalizeLiveTemplateOverride(value), {});
  }
  assert.deepEqual(normalizeLiveTemplateOverride({
    headline: "清北毕业名师",
    contentTitle: "",
    liveLibrary: { 高三: {} },
    titleGrade: { raw: "高三" },
    pages: {
      [chinesePage]: {
        subject: "语文",
        rawRows: [{ title: "底表课程" }],
        stages: {
          秋季: {
            time: "13:00–15:00",
            rows: {
              [lessonKey]: { date: 0, no: 0, title: "", time: "不保留" },
              bad: null,
              array: [],
            },
          },
          bad: "不保留",
        },
      },
      nullPage: null,
      arrayPage: [],
      unknownPage: { originalCourses: [1, 2] },
    },
  }), {
    contentTitle: "",
    headline: "清北毕业名师",
    pages: {
      [chinesePage]: {
        subject: "语文",
        stages: {
          秋季: {
            time: "13:00–15:00",
            rows: { [lessonKey]: { date: "0", no: "0", title: "" } },
          },
        },
      },
    },
  });
});

test("修改课次日期只作用于指定页面和阶段，不会改写全年底表", () => {
  const product = normalizeProduct({
    id: "live-edit-test",
    name: "名校直通卡",
    grade: "高三",
    coverageQuarters: ["秋季", "寒假"],
    liveLibrary: {
      高三: {
        语文: {
          秋季: { 一期: [{ no: 1, title: "诗歌阅读", date: "2026/10/17" }] },
          寒假: { 一期: [{ no: 1, title: "诗歌阅读", date: "2027/1/17" }] },
        },
        生物: {
          秋季: { 一期: [{ no: 1, title: "诗歌阅读", date: "2026/10/18" }] },
        },
      },
    },
    liveTemplateOverride: {
      pages: {
        [chinesePage]: { stages: {
          秋季: { rows: { [lessonKey]: { title: "阅读精讲" } } },
          寒假: { rows: { [lessonKey]: { date: "2027/1/18" } } },
        } },
        [biologyPage]: { lessonLabel: "26学时" },
      },
    },
  });
  const original = JSON.stringify(product);
  const rowsBefore = getLiveRows(product, "语文");
  const updated = updateLiveTemplateOverride(product.liveTemplateOverride, {
    scope: "row",
    pageKey: chinesePage,
    quarter: "秋季",
    rowKey: lessonKey,
    patch: { date: "2026/10/24" },
  });

  assert.deepEqual(updated.pages[chinesePage].stages.秋季.rows[lessonKey], {
    date: "2026/10/24",
    title: "阅读精讲",
  });
  assert.equal(updated.pages[chinesePage].stages.寒假.rows[lessonKey].date, "2027/1/18");
  assert.deepEqual(updated.pages[biologyPage], product.liveTemplateOverride.pages[biologyPage]);
  assert.equal(JSON.stringify(product), original);
  assert.deepEqual(getLiveRows({ ...product, liveTemplateOverride: updated }, "语文"), rowsBefore);
});

test("母版、科目和阶段编辑合并时保留下级已编辑内容", () => {
  let edited = updateLiveTemplateOverride({}, {
    scope: "row", pageKey: chinesePage, quarter: "秋季", rowKey: lessonKey,
    patch: { date: "2026/10/24", no: "补1", title: "人工改课名" },
  });
  edited = updateLiveTemplateOverride(edited, {
    scope: "stage", pageKey: chinesePage, quarter: "秋季",
    patch: { label: "秋季课程", time: "14:00–16:00", rows: {} },
  });
  edited = updateLiveTemplateOverride(edited, {
    scope: "page", pageKey: chinesePage,
    patch: { subject: "语文精讲", lessonLabel: "30学时", stages: {} },
  });
  edited = updateLiveTemplateOverride(edited, {
    scope: "template",
    patch: { titleProduct: "名校直通卡 · 学法精讲", pages: {}, liveLibrary: {} },
  });
  assert.equal(edited.titleProduct, "名校直通卡 · 学法精讲");
  assert.equal(edited.pages[chinesePage].subject, "语文精讲");
  assert.equal(edited.pages[chinesePage].lessonLabel, "30学时");
  assert.equal(edited.pages[chinesePage].stages.秋季.label, "秋季课程");
  assert.equal(edited.pages[chinesePage].stages.秋季.time, "14:00–16:00");
  assert.deepEqual(edited.pages[chinesePage].stages.秋季.rows[lessonKey], {
    date: "2026/10/24", no: "补1", title: "人工改课名",
  });
  assert.equal(Object.hasOwn(edited, "liveLibrary"), false);
});

test("规范化以及本地保存读取保留母版编辑，兼容云端 JSON 往返", (t) => {
  const stored = new Map();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
  });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });
  const override = {
    headline: "手动宣传语",
    pages: {
      [chinesePage]: {
        lessonLabel: "30学时",
        stages: { 秋季: {
          time: "13:30–15:30",
          rows: { [lessonKey]: { date: "2026/10/24", no: "0", title: "手动课名" } },
        } },
      },
    },
  };
  const product = normalizeProduct({ id: "persist-live-edits", grade: "高三", liveTemplateOverride: override });
  assert.deepEqual(product.liveTemplateOverride, override);
  assert.deepEqual(normalizeProduct(JSON.parse(JSON.stringify(product))).liveTemplateOverride, override);
  saveProduct(product);
  assert.deepEqual(loadProduct().liveTemplateOverride, override);
});

test("课次键绑定原课次和原课名，年级和科目各自隔离", () => {
  assert.notEqual(livePageKey({ grade: "高三" }, "语文"), livePageKey({ grade: "高二" }, "语文"));
  assert.notEqual(chinesePage, biologyPage);
  assert.equal(liveRowKey({ no: 0, live: "原课名" }, 2), JSON.stringify([0, "原课名"]));
  assert.equal(liveRowKey({ title: "原课名" }, 2), JSON.stringify([3, "原课名"]));
  assert.equal(liveRowKey({ id: "lesson-id", no: 1, title: "原课名" }, 2), JSON.stringify(["lesson-id", "原课名"]));
  assert.notEqual(liveRowKey({ no: 1, title: "原课名" }, 0), liveRowKey({ no: 1, title: "导入的新课名" }, 0));
  assert.notEqual(liveRowKey({ no: 1, title: "原课名" }, 0), liveRowKey({ no: 2, title: "原课名" }, 1));
});
