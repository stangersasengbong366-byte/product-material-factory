import { sortCourseQuarters } from "./courseStages.js";

const COURSE_ENTITLEMENT_RULES = {
  秋冬衔接卡: {
    live: ["秋季", "寒假"],
    video: ["秋季", "寒假"],
    liveLessons: { 秋季: 16, 寒假: 10 },
  },
  全体系直通卡: {
    live: ["秋季", "寒假", "春季"],
    video: ["秋季", "寒假", "春季"],
    liveLessons: { 秋季: 16, 寒假: 10, 春季: 16 },
  },
  名校直通卡: {
    // 高三“一轮 mini + 二轮”的直播为暑期 12 + 寒假 10 + 春季 8。
    live: ["暑期", "寒假", "春季"],
    // 知识视频底表中的一轮、二轮分别归入秋季、春季。
    video: ["秋季", "春季"],
    liveLessons: { 暑期: 12, 寒假: 10, 春季: 8 },
  },
};

export function getCourseCoverageQuarters(product, type) {
  const stage = String(product?.stage || "").trim();
  const rule = COURSE_ENTITLEMENT_RULES[stage]?.[type];
  return sortCourseQuarters(
    Array.isArray(rule) && rule.length
      ? rule
      : Array.isArray(product?.coverageQuarters)
        ? product.coverageQuarters
        : [],
  );
}

export function getExpectedLiveLessons(product, quarter) {
  const stage = String(product?.stage || "").trim();
  return Number(COURSE_ENTITLEMENT_RULES[stage]?.liveLessons?.[quarter] || 0);
}
