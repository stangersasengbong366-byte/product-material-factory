export const VIDEO_QUARTERS = ["秋季", "寒假", "春季", "暑期"];

export function expectedVideoLessonCount(subject, quarter) {
  if (quarter === "寒假") return 20;
  return ["历史", "地理", "政治"].includes(subject) ? 20 : 40;
}
