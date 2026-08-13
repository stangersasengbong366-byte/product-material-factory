import { demoProduct } from "./data/demoProduct";

const STORAGE_KEY = "youdao-course-material-studio-product-v1";

export function loadProduct() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return normalizeProduct(stored || demoProduct);
  } catch {
    return normalizeProduct(demoProduct);
  }
}

export function saveProduct(product) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProduct(product)));
}

export function normalizeProduct(input) {
  const coverageQuarters =
    Array.isArray(input?.coverageQuarters) && input.coverageQuarters.length
      ? input.coverageQuarters
      : inferCoverageQuarters(input?.stage);
  return {
    id: String(input?.id || `product-${Date.now()}`),
    name: String(input?.name || "未命名产品"),
    grade: String(input?.grade || "未设置年级"),
    stage: String(input?.stage || "未设置卡型"),
    status: String(input?.status || "配置中"),
    uploadNames: { ...(input?.uploadNames || {}) },
    coverageQuarters,
    liveBatch: String(input?.liveBatch || "一期"),
    liveLibrary: normalizeLiveLibrary(input?.liveLibrary || {}),
    liveImportSummary: input?.liveImportSummary || null,
    liveImportIgnoredRows: Number(input?.liveImportIgnoredRows || 0),
    live: normalizeLive(input?.live || input?.parsedCourseData?.live || {}),
    videoTrack: String(input?.videoTrack || "目标班"),
    videoLibrary: normalizeVideoLibrary(input?.videoLibrary || {}),
    videoImportSummary: input?.videoImportSummary || null,
    videoImportIgnoredRows: Number(input?.videoImportIgnoredRows || 0),
    video: normalizeVideo(input?.video || input?.parsedCourseData?.video || {}),
    gifts: normalizeGifts(
      input?.gifts ||
        input?.giftCourses ||
        (input?.id === demoProduct.id ? demoProduct.gifts : {}),
    ),
    giftCopyOverrides: normalizeGiftCopyOverrides(input?.giftCopyOverrides),
    giftTemplateOverride: normalizeGiftTemplateOverride(
      input?.giftTemplateOverride,
    ),
    priceConfig: normalizePriceConfig(input?.priceConfig, input),
  };
}

function normalizeGiftTemplateOverride(value = {}) {
  return {
    ...(value?.name ? { name: String(value.name) } : {}),
    ...(value?.intro ? { intro: String(value.intro) } : {}),
  };
}

function normalizeGiftCopyOverrides(value = {}) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([subject, item = {}]) => [
      subject,
      {
        ...(item.name ? { name: String(item.name) } : {}),
        ...(item.subject ? { subject: String(item.subject) } : {}),
        ...(item.intro ? { intro: String(item.intro) } : {}),
        ...(Array.isArray(item.lessons)
          ? {
              lessons: item.lessons.map((lesson) => ({
                ...lesson,
                title: String(lesson?.title || "未命名课程"),
              })),
            }
          : {}),
      },
    ]),
  );
}

export function buildMaterialTasks(product) {
  const tasks = [];
  const liveSubjects = new Set([
    ...Object.keys(product.live || {}),
    ...Object.keys(product.liveLibrary?.[product.grade] || {}),
  ]);
  liveSubjects.forEach((subject) => {
    const rows = getLiveRows(product, subject);
    if (rows.length)
      tasks.push({
        id: slug(`${subject}-live`),
        subject,
        type: "学法直播",
        track: "阶段直播",
        count: rows.length,
      });
  });
  const videoLibrarySubjects = Object.keys(
    product.videoLibrary?.[product.grade] || {},
  );
  if (videoLibrarySubjects.length)
    videoLibrarySubjects.forEach((subject) => {
      const targetRows = getVideoRows(product, subject, "目标班");
      const eliteRows = getVideoRows(product, subject, "精英班");
      const needsTwoVersions =
        subject === "数学" || !sameVideoOutline(targetRows, eliteRows);
      if (needsTwoVersions) {
        if (targetRows.length)
          tasks.push({
            id: slug(`${subject}-video-目标班`),
            subject,
            type: "知识视频",
            track: "目标班",
            count: targetRows.length,
          });
        if (eliteRows.length)
          tasks.push({
            id: slug(`${subject}-video-精英班`),
            subject,
            type: "知识视频",
            track: "精英班",
            count: eliteRows.length,
          });
      } else if (targetRows.length || eliteRows.length) {
        const rows = targetRows.length ? targetRows : eliteRows;
        tasks.push({
          id: slug(`${subject}-video-通用版`),
          subject,
          type: "知识视频",
          track: "通用版",
          count: rows.length,
        });
      }
    });
  else
    Object.entries(product.video || {}).forEach(([subject, trackMap]) =>
      Object.entries(trackMap || {}).forEach(([track, rows]) => {
        if (Array.isArray(rows) && rows.length)
          tasks.push({
            id: slug(`${subject}-video-${track}`),
            subject,
            type: "知识视频",
            track,
            count: rows.length,
          });
      }),
    );
  Object.entries(product.gifts || {}).forEach(([subject, rows]) => {
    if (Array.isArray(rows) && rows.length)
      tasks.push({
        id: slug(`${subject}-gift`),
        subject,
        type: "赠课",
        track: "对应学科",
        count: rows.length,
      });
  });
  if (product.priceConfig?.enabled !== false) {
    tasks.push({
      id: slug("price-system-non-wenzong"),
      subject: "非文综价格",
      type: "价格",
      track: "非文综阶梯价",
      priceMode: "nonWenZong",
      count: 1,
    });
    tasks.push({
      id: slug("price-system-non-wenzong-no-single"),
      subject: "非文综无单科价格",
      type: "价格",
      track: "非文综阶梯价（无单科）",
      priceMode: "nonWenZongNoSingle",
      count: 1,
    });
    if (product.priceConfig?.wenZongMode !== "none")
      tasks.push({
        id: slug("price-system-wenzong"),
        subject: "文综价格",
        type: "价格",
        track:
          product.priceConfig?.wenZongMode === "same"
            ? "文综同价"
            : "文综一口价",
        priceMode: "wenZong",
        count: 1,
      });
  }
  return tasks;
}

function normalizePriceConfig(value = {}, product = {}) {
  const config = value || {};
  const gradeTitle = `${String(product?.grade || "高一")}年级`;
  const productName = String(product?.name || "课程卡");
  const productTitle = productName.startsWith(gradeTitle)
    ? productName.slice(gradeTitle.length)
    : productName.startsWith(String(product?.grade || ""))
      ? productName.slice(String(product?.grade || "").length)
      : productName;
  return {
    enabled: config.enabled !== false,
    titleGrade: String(config.titleGrade || gradeTitle),
    titleProduct: String(config.titleProduct || productTitle || product?.stage || "课程卡"),
    titleSuffix: String(config.titleSuffix || "价格体系"),
    subjectScope: String(config.subjectScope || "语数英物化"),
    wenZongSubjectScope: String(config.wenZongSubjectScope || "政治・历史・地理"),
    tag: String(config.tag || "非文综"),
    wenZongTag: String(config.wenZongTag || "文综"),
    wenZongCourseLabel: String(config.wenZongCourseLabel || "文综单科"),
    officialUnitPrice: Number(config.officialUnitPrice || 0),
    tier1: Number(config.tier1 || 0),
    tier2: Number(config.tier2 || 0),
    tier3: Number(config.tier3 || 0),
    wenZongMode: ["none", "same", "deal"].includes(config.wenZongMode)
      ? config.wenZongMode
      : "deal",
    wenZongOfficialUnitPrice: Number(config.wenZongOfficialUnitPrice || 0),
    wenZongDealUnitPrice: Number(config.wenZongDealUnitPrice || 0),
    knowledgeHours: Number(config.knowledgeHours || 0),
    knowledgeGift: String(config.knowledgeGift || ""),
    liveHours: Number(config.liveHours || 0),
    liveGift: String(config.liveGift || ""),
    serviceText: String(config.serviceText || "辅导老师服务/科"),
    serviceGift: String(config.serviceGift || ""),
    servicePeriod: String(config.servicePeriod || "2026年12月31日前"),
    wenZongKnowledgeHours: String(config.wenZongKnowledgeHours || ""),
    wenZongKnowledgeGift: String(config.wenZongKnowledgeGift || ""),
    wenZongLiveHours: String(config.wenZongLiveHours || ""),
    wenZongLiveGift: String(config.wenZongLiveGift || ""),
    wenZongServiceText: String(config.wenZongServiceText || ""),
    wenZongServiceGift: String(config.wenZongServiceGift || ""),
    notes: Array.isArray(config.notes)
      ? config.notes.map(String)
      : ["更多赠礼联系学业规划师了解", "三科及以上享最优惠单价"],
    subtitle: String(config.subtitle || product?.stage || "课程产品"),
  };
}

export function getLiveRows(product, subject) {
  const gradeLibrary = product?.liveLibrary?.[product.grade]?.[subject];
  if (!gradeLibrary) return product?.live?.[subject] || [];
  return (product.coverageQuarters || []).flatMap((quarter) => {
    const stage = gradeLibrary?.[quarter] || {};
    const rows =
      stage["一期"] || Object.values(stage).find((item) => item?.length) || [];
    return rows.map((row) => ({ ...row, quarter, batch: "自动关联" }));
  });
}

export function getVideoRows(
  product,
  subject,
  track = product?.videoTrack || "目标班",
) {
  const subjectLibrary = product?.videoLibrary?.[product.grade]?.[subject];
  const resolvedTrack = track === "通用版" ? "目标班" : track;
  if (!subjectLibrary) return product?.video?.[subject]?.[resolvedTrack] || [];
  const bucket = resolvedTrack === "精英班" ? "elite" : "target";
  return (product.coverageQuarters || [])
    .filter((quarter) => quarter === "秋季" || quarter === "春季")
    .flatMap((quarter) => {
      const stage = subjectLibrary[quarter];
      if (!stage) return [];
      const allowedBuckets = new Set(["common", "layered", bucket]);
      const orderedRows = Array.isArray(stage.ordered)
        ? stage.ordered
        : [
            ...(stage.common || []),
            ...(stage.layered || []),
            ...(stage[bucket] || []),
          ].sort(
            (left, right) =>
              Number(left.sourceOrder ?? Number.MAX_SAFE_INTEGER) -
              Number(right.sourceOrder ?? Number.MAX_SAFE_INTEGER),
          );
      return orderedRows
        .filter((row) => allowedBuckets.has(row.bucket))
        .map((row, index) => ({
          ...row,
          no: row.no ?? index + 1,
          quarter,
          track,
        }));
    });
}

function sameVideoOutline(left, right) {
  if (left.length !== right.length) return false;
  const signature = (row) =>
    [row.quarter, row.title, row.module, row.scoreShare, row.difficulty]
      .map((value) => String(value || "").trim())
      .join("|");
  return left.every((row, index) => signature(row) === signature(right[index]));
}

export function inferCoverageQuarters(stage) {
  const label = String(stage || "");
  if (/暑秋|夏秋|半年/.test(label) && /暑|夏/.test(label))
    return ["暑期", "秋季"];
  if (/寒春|冬春/.test(label)) return ["寒假", "春季"];
  if (/夏研|暑/.test(label)) return ["暑期"];
  if (/秋实|秋/.test(label)) return ["秋季"];
  if (/春思|春/.test(label)) return ["春季"];
  if (/寒|冬/.test(label)) return ["寒假"];
  return ["秋季"];
}

function normalizeLive(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([subject, rows]) => [
      subject,
      (rows || []).map((row, index) => ({
        ...row,
        no: row.no ?? index + 1,
        title: row.title || row.live || "未命名课程",
      })),
    ]),
  );
}

function normalizeLiveLibrary(data) {
  const result = {};
  Object.entries(data || {}).forEach(([grade, subjects]) =>
    Object.entries(subjects || {}).forEach(([subject, quarters]) =>
      Object.entries(quarters || {}).forEach(([quarter, batches]) =>
        Object.entries(batches || {}).forEach(([batch, rows]) => {
          ((((result[grade] ||= {})[subject] ||= {})[quarter] ||= {})[batch] ||=
            []).push(
            ...(rows || []).map((row, index) => ({
              ...row,
              no: index + 1,
              grade,
              subject,
              quarter,
              batch,
              title: row.title || "未命名课程",
            })),
          );
        }),
      ),
    ),
  );
  return result;
}

function normalizeVideo(data) {
  const result = {};
  Object.entries(data || {}).forEach(([subject, value]) => {
    if (Array.isArray(value)) {
      const groups = {};
      value.forEach((row) => {
        const track = /菁英|精英/.test(row.layered || "")
          ? "菁英班"
          : /目标/.test(row.layered || "")
            ? "目标班"
            : "不分班";
        (groups[track] ||= []).push(row);
      });
      result[subject] = groups;
    } else result[subject] = value || {};
  });
  return result;
}

function normalizeVideoLibrary(data) {
  const result = {};
  Object.entries(data || {}).forEach(([grade, subjects]) =>
    Object.entries(subjects || {}).forEach(([subject, quarters]) =>
      Object.entries(quarters || {}).forEach(([quarter, buckets]) => {
        const target = (((result[grade] ||= {})[subject] ||= {})[quarter] ||=
          {});
        ["common", "target", "elite", "layered"].forEach((bucket) => {
          target[bucket] = (buckets?.[bucket] || []).map((row, index) => ({
            ...row,
            no: row.no ?? index + 1,
            grade,
            subject,
            quarter,
            bucket,
            title: row.title || "未命名知识视频",
          }));
        });
        target.ordered = (buckets?.ordered || [
          ...(buckets?.common || []),
          ...(buckets?.target || []),
          ...(buckets?.elite || []),
          ...(buckets?.layered || []),
        ]).map((row, index) => ({
          ...row,
          no: row.no ?? index + 1,
          grade,
          subject,
          quarter,
          title: row.title || "未命名知识视频",
        }));
      }),
    ),
  );
  return result;
}

function normalizeGifts(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([subject, rows]) => [
      subject,
      (rows || []).map((row, index) =>
        typeof row === "string"
          ? { no: index + 1, title: row, detail: "赠课权益" }
          : {
              ...row,
              no: row.no ?? index + 1,
              title: row.title || row.name || "未命名赠课",
            },
      ),
    ]),
  );
}

function slug(value) {
  return String(value)
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "");
}
