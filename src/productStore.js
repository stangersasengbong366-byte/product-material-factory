import { demoProduct } from "./data/demoProduct.js";
import { COURSE_SUBJECTS } from "./courseSubjects.js";
import { normalizeLiveTemplateOverride } from "./liveTemplate.js";
import { sortCourseQuarters } from "./courseStages.js";

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
  const grade = String(input?.grade || "未设置年级");
  const requestedQuarters = sortCourseQuarters(
    Array.isArray(input?.coverageQuarters) && input.coverageQuarters.length
      ? input.coverageQuarters
      : inferCoverageQuarters(input?.stage),
  );
  // 高三底表将一轮、二轮分别映射到秋季、春季。旧配置中“名校直通卡”
  // 只保存了秋季时，会遗漏完整二轮，导致目标/菁英班各只统计到 60 节。
  // 仅在该产品的全年库确实存在二轮内容时补齐春季，不影响只配置单阶段的产品。
  const hasSecondRound = Object.values(input?.videoLibrary?.[grade] || {}).some(
    (subjectLibrary) => Boolean(subjectLibrary?.春季),
  );
  const coverageQuarters = sortCourseQuarters(
    grade === "高三" &&
      requestedQuarters.includes("秋季") &&
      !requestedQuarters.includes("春季") &&
      hasSecondRound
      ? [...requestedQuarters, "春季"]
      : requestedQuarters,
  );
  return {
    id: String(input?.id || `product-${Date.now()}`),
    name: String(input?.name || "未命名产品"),
    grade,
    stage: String(input?.stage || "未设置卡型"),
    status: String(input?.status || "配置中"),
    uploadNames: { ...(input?.uploadNames || {}) },
    coverageQuarters,
    liveBatch: String(input?.liveBatch || "一期"),
    liveLibrary: normalizeLiveLibrary(input?.liveLibrary || {}),
    liveImportSummary: input?.liveImportSummary || null,
    liveImportIgnoredRows: Number(input?.liveImportIgnoredRows || 0),
    live: normalizeLive(input?.live || input?.parsedCourseData?.live || {}),
    liveTemplateOverride: normalizeLiveTemplateOverride(input?.liveTemplateOverride),
    videoTrack: normalizeVideoTrack(input?.videoTrack || "目标班"),
    videoLibrary: normalizeVideoLibrary(input?.videoLibrary || {}),
    videoImportSummary: input?.videoImportSummary || null,
    videoImportIgnoredRows: Number(input?.videoImportIgnoredRows || 0),
    video: normalizeVideo(input?.video || input?.parsedCourseData?.video || {}),
    videoTemplateOverride: normalizeVideoTemplateOverride(
      input?.videoTemplateOverride,
    ),
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

// 上传新底表时，课程行必须以新解析结果为准。保留海报的文案和版式设置，
// 仅清除按旧课程顺序保存的逐行修改，避免旧班型内容覆盖新班型课程。
export function clearVideoPageRowOverrides(value = {}) {
  if (!value || typeof value !== "object") return {};
  if (!value.pages || typeof value.pages !== "object") return value;
  return {
    ...value,
    pages: Object.fromEntries(
      Object.entries(value.pages).map(([key, page = {}]) => {
        if (!page || typeof page !== "object") return [key, page];
        const { rows, ...pageSettings } = page;
        return [key, pageSettings];
      }),
    ),
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

function normalizeVideoTemplateOverride(value = {}) {
  if (!value || typeof value !== "object") return {};
  const textFields = [
    "titleGrade",
    "titleProduct",
    "knowledgeLabel",
    "headline",
    "outlineTitle",
    "levelBasic",
    "levelAbility",
    "levelAdvanced",
    "difficultyEasy",
    "difficultyMedium",
    "difficultyHard",
    "headerNo",
    "headerTitle",
    "headerDifficulty",
    "layerBadge",
    "adviceTitle",
    "footer",
  ];
  const normalized = Object.fromEntries(
    textFields
      .filter((field) => value[field] != null)
      .map((field) => [field, normalizeVideoHostCopy(value[field])]),
  );
  if (Array.isArray(value.benefits)) {
    normalized.benefits = value.benefits.slice(0, 3).map((benefit = {}) => ({
      icon: String(benefit.icon || ""),
      title: normalizeVideoHostCopy(benefit.title),
      detail: normalizeVideoHostCopy(benefit.detail),
    }));
  }
  if (Array.isArray(value.adviceLines)) {
    normalized.adviceLines = value.adviceLines
      .slice(0, 2)
      .map(normalizeVideoHostCopy);
  }
  if (value.pages && typeof value.pages === "object") {
    normalized.pages = Object.fromEntries(
      Object.entries(value.pages).map(([key, page = {}]) => {
        const [subject, track] = String(key).split("::");
        const normalizedKey = track
          ? `${subject}::${normalizeVideoTrack(track)}`
          : key;
        return [normalizedKey, {
          ...(page.subject != null ? { subject: String(page.subject) } : {}),
          ...(page.track != null
            ? { track: normalizeVideoTrack(page.track) }
            : {}),
          ...(Array.isArray(page.rows)
            ? {
                rows: page.rows.map((row = {}, index) => ({
                  no: String(row.no ?? index + 1),
                  title: String(row.title || "未命名知识视频"),
                  module: String(row.module || "其他模块"),
                  scoreShare: String(row.scoreShare || ""),
                  difficulty: String(row.difficulty || "1星"),
                  layer: String(row.layer || "通用"),
                })),
              }
            : {}),
        }];
      }),
    );
  }
  return normalized;
}

function normalizeVideoHostCopy(value) {
  return String(value || "").replaceAll("清北主理人", "清北毕业主理人");
}

function normalizeVideoTrack(value) {
  const label = String(value || "");
  if (/菁英|精英|英才/.test(label)) return "菁英班";
  if (/目标/.test(label)) return "目标班";
  if (/通用/.test(label)) return "通用版";
  return label || "通用版";
}

export function buildMaterialTasks(product) {
  const tasks = [];
  const annualLiveSubjects = Object.keys(
    product.liveLibrary?.[product.grade] || {},
  );
  const liveSubjects = new Set(
    annualLiveSubjects.length
      ? [
          ...COURSE_SUBJECTS,
          ...Object.keys(product.live || {}),
          ...annualLiveSubjects,
        ]
      : Object.keys(product.live || {}),
  );
  liveSubjects.forEach((subject) => {
    const rows = getLiveRows(product, subject);
    tasks.push({
      id: slug(`${subject}-live`),
      subject,
      type: "学法直播",
      track: rows.length ? "阶段直播" : "待补充课表",
      count: rows.length,
    });
  });
  const videoLibrarySubjects = Object.keys(
    product.videoLibrary?.[product.grade] || {},
  );
  if (videoLibrarySubjects.length)
    videoLibrarySubjects.forEach((subject) => {
      const targetRows = getVideoRows(product, subject, "目标班");
      const eliteRows = getVideoRows(product, subject, "菁英班");
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
            id: slug(`${subject}-video-菁英班`),
            subject,
            type: "知识视频",
            track: "菁英班",
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
    tasks.push({
      id: slug("price-system-non-wenzong-no-six"),
      subject: "非文综去六科价格",
      type: "价格",
      track: "非文综阶梯价（去六科）",
      priceMode: "nonWenZongNoSix",
      count: 1,
    });
    tasks.push({
      id: slug("price-system-non-wenzong-no-single-no-six"),
      subject: "非文综无单科去六科价格",
      type: "价格",
      track: "非文综阶梯价（无单科・去六科）",
      priceMode: "nonWenZongNoSingleNoSix",
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
  const normalizedTrack = normalizeVideoTrack(track);
  const resolvedTrack = normalizedTrack === "通用版" ? "目标班" : normalizedTrack;
  if (!subjectLibrary) return product?.video?.[subject]?.[resolvedTrack] || [];
  const bucket = resolvedTrack === "菁英班" ? "elite" : "target";
  const rows = (product.coverageQuarters || []).flatMap((quarter, quarterIndex) => {
    const stage = subjectLibrary[quarter];
    if (!stage) return [];
    const allowedBuckets = new Set(["common", "layered", bucket]);
    const trackRows = stage.orderedByTrack?.[bucket];
    const orderedRows = Array.isArray(trackRows)
      ? trackRows
      : Array.isArray(stage.ordered)
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
      .map((row) => ({
        ...row,
        sourceNo: row.no,
        quarter,
        track: normalizedTrack,
        quarterIndex,
      }));
  });
  // The workbook may interleave first- and second-round rows. Keep its original
  // row order after track filtering instead of concatenating by course stage.
  rows.sort((left, right) => {
    const leftOrder = Number(left.sourceOrder);
    const rightOrder = Number(right.sourceOrder);
    const hasLeftOrder = Number.isFinite(leftOrder);
    const hasRightOrder = Number.isFinite(rightOrder);
    if (hasLeftOrder && hasRightOrder && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    if (hasLeftOrder !== hasRightOrder) return hasLeftOrder ? -1 : 1;
    return left.quarterIndex - right.quarterIndex;
  });
  return rows.map(({ quarterIndex, ...row }, index) => ({ ...row, no: index + 1 }));
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
    } else {
      const groups = {};
      Object.entries(value || {}).forEach(([track, rows]) => {
        const normalizedTrack = normalizeVideoTrack(track);
        (groups[normalizedTrack] ||= []).push(...(rows || []));
      });
      result[subject] = groups;
    }
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
        const fallbackOrdered = [
          ...(buckets?.common || []),
          ...(buckets?.target || []),
          ...(buckets?.elite || []),
          ...(buckets?.layered || []),
        ];
        ["common", "target", "elite", "layered"].forEach((bucket) => {
          target[bucket] = normalizeVideoRows(
            buckets?.[bucket] || [],
            { grade, subject, quarter, bucket },
          );
        });
        target.ordered = normalizeVideoRows(
          buckets?.ordered || fallbackOrdered,
          { grade, subject, quarter },
        );
        if (buckets?.orderedByTrack) {
          target.orderedByTrack = Object.fromEntries(
            ["target", "elite"].map((track) => [
              track,
              normalizeVideoRows(buckets.orderedByTrack[track] || [], {
                grade,
                subject,
                quarter,
              }),
            ]),
          );
        }
      }),
    ),
  );
  return result;
}

function normalizeVideoRows(rows, context = {}) {
  let currentModule = "";
  let currentScoreShare = "";
  return (rows || []).map((row, index) => {
    const module = String(row?.module || "").trim();
    const scoreShare = String(row?.scoreShare || "").trim();
    if (module && module !== currentModule) {
      currentModule = module;
      currentScoreShare = scoreShare;
    } else if (scoreShare) {
      currentScoreShare = scoreShare;
    }
    return {
      ...row,
      no: row.no ?? index + 1,
      ...context,
      title: row.title || "未命名知识视频",
      module: module || currentModule || "其他模块",
      scoreShare: scoreShare || currentScoreShare,
      isLayered:
        typeof row?.isLayered === "boolean"
          ? row.isLayered
          : isLayeredVideoCourse(row?.layer),
    };
  });
}

function isLayeredVideoCourse(value) {
  const label = String(value || "").trim();
  return Boolean(label) && label !== "通用" && label !== "否";
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
