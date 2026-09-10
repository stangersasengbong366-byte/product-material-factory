const TEMPLATE_FIELDS = [
  "titleGrade",
  "titleProduct",
  "contentTitle",
  "headline",
  "subheadline",
  "featureExam",
  "featureBank",
  "featureClass",
  "featureNotes",
  "timeLabel",
  "dateHeader",
  "noHeader",
  "courseHeader",
];
const PAGE_FIELDS = ["subject", "lessonLabel"];
const STAGE_FIELDS = ["label", "time"];
const ROW_FIELDS = ["date", "no", "title"];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function pickFields(value, fields) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, value[field]]),
  );
}

function normalizeTextFields(value, fields) {
  return Object.fromEntries(
    Object.entries(pickFields(value, fields))
      .filter(([, text]) =>
        typeof text === "string" ||
        (typeof text === "number" && Number.isFinite(text)),
      )
      .map(([field, text]) => [field, String(text)]),
  );
}

function normalizeMap(value, normalizeItem) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => isRecord(item))
      .map(([key, item]) => [key, normalizeItem(item)])
      .filter(([, item]) => Object.keys(item).length),
  );
}

function withMap(value, key, map) {
  return Object.keys(map).length ? { ...value, [key]: map } : value;
}

export function livePageKey(product, subject) {
  return JSON.stringify([product.grade, subject]);
}

export function liveRowKey(row, index) {
  return JSON.stringify([
    row.id ?? row.no ?? index + 1,
    row.title || row.live || "",
  ]);
}

// Only display changes belong here; course-library data remains the source.
export function normalizeLiveTemplateOverride(value) {
  if (!isRecord(value)) return {};
  const pages = normalizeMap(value.pages, (page) => {
    const stages = normalizeMap(page.stages, (stage) => {
      const rows = normalizeMap(stage.rows, (row) =>
        normalizeTextFields(row, ROW_FIELDS),
      );
      return withMap(normalizeTextFields(stage, STAGE_FIELDS), "rows", rows);
    });
    return withMap(normalizeTextFields(page, PAGE_FIELDS), "stages", stages);
  });
  return withMap(normalizeTextFields(value, TEMPLATE_FIELDS), "pages", pages);
}

export function updateLiveTemplateOverride(current, change = {}) {
  const normalized = normalizeLiveTemplateOverride(current);
  const { scope, pageKey, quarter, rowKey, patch } = change || {};
  if (scope === "template") {
    return normalizeLiveTemplateOverride({
      ...normalized,
      ...pickFields(patch, TEMPLATE_FIELDS),
    });
  }
  if (!["page", "stage", "row"].includes(scope) || typeof pageKey !== "string") {
    return normalized;
  }

  const page = normalized.pages?.[pageKey] || {};
  let updatedPage;
  if (scope === "page") {
    updatedPage = { ...page, ...pickFields(patch, PAGE_FIELDS) };
  } else {
    if (typeof quarter !== "string") return normalized;
    const stage = page.stages?.[quarter] || {};
    let updatedStage;
    if (scope === "stage") {
      updatedStage = { ...stage, ...pickFields(patch, STAGE_FIELDS) };
    } else {
      if (typeof rowKey !== "string") return normalized;
      updatedStage = {
        ...stage,
        rows: {
          ...stage.rows,
          [rowKey]: { ...stage.rows?.[rowKey], ...pickFields(patch, ROW_FIELDS) },
        },
      };
    }
    updatedPage = { ...page, stages: { ...page.stages, [quarter]: updatedStage } };
  }
  return normalizeLiveTemplateOverride({
    ...normalized,
    pages: { ...normalized.pages, [pageKey]: updatedPage },
  });
}
