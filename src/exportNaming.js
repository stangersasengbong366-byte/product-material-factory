export function getTaskFilename(product, task) {
  const parts = [product.name, product.grade, task.subject, task.type];
  if (task.type === "知识视频")
    parts.push(normalizeExportTrack(task.track));
  else if (task.track) parts.push(task.track);
  return `${parts.map(sanitizeFilenamePart).join("_")}.png`;
}

export function normalizeExportTrack(track) {
  const label = String(track || "通用版");
  if (/菁英|精英|英才/.test(label)) return "菁英班";
  if (/目标/.test(label)) return "目标班";
  return label;
}

export function sanitizeFilenamePart(value) {
  return String(value || "未命名")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");
}
