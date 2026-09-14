export const COURSE_QUARTERS = ["暑期", "秋季", "寒假", "春季"];

const HIGH_THREE_STAGE_LABELS = {
  暑期: "一轮·暑",
  秋季: "一轮·秋",
  寒假: "二轮·寒",
  春季: "二轮·春",
};

export function sortCourseQuarters(quarters = []) {
  return [...new Set(quarters)].sort((left, right) => {
    const leftIndex = COURSE_QUARTERS.indexOf(left);
    const rightIndex = COURSE_QUARTERS.indexOf(right);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
}

export function formatCourseStage(grade, quarter) {
  if (grade === "高三") return HIGH_THREE_STAGE_LABELS[quarter] || quarter;
  return quarter;
}

export function formatCourseStages(grade, quarters = []) {
  return sortCourseQuarters(quarters)
    .map((quarter) => formatCourseStage(grade, quarter))
    .join(" + ");
}
