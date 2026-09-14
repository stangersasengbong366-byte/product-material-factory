import { COURSE_QUARTERS } from "./courseStages.js";

export const VIDEO_QUARTERS = COURSE_QUARTERS;

export function expectedVideoLessonCount(subject, quarter, grade = "") {
  if (quarter === "寒假") return 20;
  if (grade === "高三")
    return ["历史", "地理", "政治"].includes(subject) ? 30 : 60;
  return ["历史", "地理", "政治"].includes(subject) ? 20 : 40;
}
