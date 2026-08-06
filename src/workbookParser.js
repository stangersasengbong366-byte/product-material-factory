const SUBJECTS = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "政治",
];
const LIVE_BATCHES = ["早鸟期", "一期", "二期", "三期"];
const VALID_GRADES = ["高一", "高二", "高三"];
const VALID_QUARTERS = ["寒假", "春季", "暑期", "秋季"];

export async function parseCourseWorkbook(file, type) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  if (type === "gift") {
    const giftRows = workbook.SheetNames.flatMap((sheetName) =>
      XLSX.utils
        .sheet_to_json(workbook.Sheets[sheetName], {
          defval: "",
          raw: false,
          header: 1,
        })
        .map((values) => ({ __sheet: sheetName, __rowValues: values })),
    );
    const parsed = parseGifts(giftRows, cleanGiftWorkbookName(file.name));
    if (!Object.keys(parsed).length)
      throw new Error("赠课底表中没有可读取的科目课程");
    return parsed;
  }
  const rows = workbook.SheetNames.flatMap((sheetName) => {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
      raw: false,
    });
    return sheetRows.map((row) => ({ ...row, __sheet: sheetName }));
  });
  if (!rows.length) throw new Error("表格中没有可读取的数据行");
  if (type === "live") return parseLive(rows);
  if (type === "video") return parseVideo(rows);
  return parseGifts(rows, cleanGiftWorkbookName(file.name));
}

function parseLive(rows) {
  const library = {};
  let ignoredRows = 0;
  rows.forEach((row) => {
    const subject = resolveSubject(row);
    const grade = normalizeGrade(pickExact(row, "年级"));
    const quarter = normalizeQuarter(pickExact(row, "季度"));
    const title =
      pickExact(row, "课程大纲") ||
      pick(row, ["课程内容", "课程名称", "课题", "标题", "直播主题"]);
    if (!subject || !grade || !quarter || !title) {
      ignoredRows += 1;
      return;
    }
    const rawBatch = Object.fromEntries(
      LIVE_BATCHES.map((batch) => [
        batch,
        {
          date: pickExact(row, `${batch}-上课日期`),
          time: pickExact(row, `${batch}-上课时间`),
        },
      ]),
    );
    LIVE_BATCHES.forEach((batch) => {
      const resolved = resolveBatchSchedule(batch, rawBatch, new Set());
      const list = ((((library[grade] ||= {})[subject] ||= {})[quarter] ||= {})[
        batch
      ] ||= []);
      list.push({
        no: list.length + 1,
        grade,
        subject,
        quarter,
        batch,
        date: resolved.date,
        time: resolved.time,
        title,
      });
    });
  });
  return { library, summary: summarizeLiveLibrary(library), ignoredRows };
}

function resolveBatchSchedule(batch, schedules, visited) {
  if (visited.has(batch)) return { date: "", time: "" };
  visited.add(batch);
  const current = schedules[batch] || {};
  const reference =
    resolveBatchReference(current.date) || resolveBatchReference(current.time);
  if (reference) {
    const inherited = resolveBatchSchedule(reference, schedules, visited);
    return {
      date: cleanScheduleValue(current.date) || inherited.date,
      time: cleanScheduleValue(current.time) || inherited.time,
    };
  }
  const direct = {
    date: cleanScheduleValue(current.date),
    time: cleanScheduleValue(current.time),
  };
  if (direct.date || direct.time) return direct;
  const fallbackBatch = ["一期", "早鸟期", "二期", "三期"].find(
    (candidate) =>
      candidate !== batch &&
      (cleanScheduleValue(schedules[candidate]?.date) ||
        cleanScheduleValue(schedules[candidate]?.time)),
  );
  return fallbackBatch
    ? resolveBatchSchedule(fallbackBatch, schedules, visited)
    : direct;
}

function resolveBatchReference(value) {
  const label = String(value || "").replace(/\s+/g, "");
  if (/同(?:1|一)期/.test(label)) return "一期";
  if (/同早鸟期?/.test(label)) return "早鸟期";
  if (/同(?:2|二)期/.test(label)) return "二期";
  if (/同(?:3|三)期/.test(label)) return "三期";
  return "";
}

function cleanScheduleValue(value) {
  const label = String(value || "").trim();
  return !label || label === "/" || resolveBatchReference(label) ? "" : label;
}

function summarizeLiveLibrary(library) {
  const cells = [];
  Object.entries(library).forEach(([grade, subjects]) =>
    Object.entries(subjects).forEach(([subject, quarters]) =>
      Object.entries(quarters).forEach(([quarter, batches]) => {
        cells.push({
          grade,
          subject,
          quarter,
          lessons: Math.max(
            0,
            ...Object.values(batches).map((rows) => rows.length),
          ),
        });
      }),
    ),
  );
  return {
    grades: [...new Set(cells.map((item) => item.grade))],
    subjects: [...new Set(cells.map((item) => item.subject))],
    quarters: [...new Set(cells.map((item) => item.quarter))],
    cells,
    lessonRows: cells.reduce((sum, item) => sum + item.lessons, 0),
  };
}

function parseVideo(rows) {
  const sheetGroups = groupBy(rows, (row) => row.__sheet);
  const candidates = [];
  let ignoredRows = 0;
  Object.entries(sheetGroups).forEach(([sheetName, sheetRows]) => {
    if (/废弃|工作表/.test(sheetName)) {
      ignoredRows += sheetRows.length;
      return;
    }
    const subject = resolveSubject({ __sheet: sheetName });
    const grade = normalizeGrade(sheetName);
    if (!subject || !grade) {
      ignoredRows += sheetRows.length;
      return;
    }
    let currentModule = "";
    const stageRows = {};
    sheetRows.forEach((row) => {
      currentModule = pickExact(row, "模块") || currentModule;
      const title =
        pickExact(row, "视频大纲") ||
        pick(row, ["知识视频标题", "课程内容", "课程名称", "课题", "标题"]);
      const rawStage = pick(row, ["夏/秋/冬/春", "季度", "阶段", "轮次"]);
      const quarter = normalizeVideoQuarter(rawStage, subject);
      if (!title || !quarter || /赠课/.test(rawStage)) {
        ignoredRows += 1;
        return;
      }
      const layerValue =
        pickExact(row, "是否分层") ||
        pick(row, ["班型", "层次", "分层", "视频班型"]);
      const bucket = resolveVideoBucket(layerValue, title);
      const item = {
        grade,
        subject,
        quarter,
        bucket,
        title: title.replace(/【(?:目标|菁英|精英|英才)班?】/g, "").trim(),
        difficulty:
          pickExact(row, "（1星/2星/3星/4星）") ||
          pick(row, ["星级难度", "难度", "难度星级"]) ||
          "1星",
        module: currentModule || "其他模块",
        scoreShare:
          pickExact(row, "涉及知识所占高考分值及题型") ||
          pick(row, ["模块分值", "分值占比", "分值", "占比"]),
        layer:
          bucket === "common"
            ? "通用"
            : bucket === "layered"
              ? "分层内容"
              : bucket === "target"
                ? "目标班"
                : "精英班",
      };
      (stageRows[quarter] ||= []).push(item);
    });
    Object.entries(stageRows).forEach(([quarter, items]) =>
      candidates.push({ sheetName, grade, subject, quarter, items }),
    );
  });

  const library = {};
  const selectedSources = [];
  const candidateGroups = groupBy(
    candidates,
    (item) => `${item.grade}|${item.subject}|${item.quarter}`,
  );
  Object.values(candidateGroups).forEach((options) => {
    const expected = isHumanities(options[0].subject) ? 20 : 40;
    const selected = [...options].sort(
      (a, b) =>
        Math.abs(resolvedVideoCount(a.items) - expected) -
        Math.abs(resolvedVideoCount(b.items) - expected),
    )[0];
    const buckets = { common: [], target: [], elite: [], layered: [] };
    selected.items.forEach((item) => buckets[item.bucket].push(item));
    Object.values(buckets).forEach((items) =>
      items.forEach((item, index) => {
        item.no = index + 1;
      }),
    );
    ((library[selected.grade] ||= {})[selected.subject] ||= {})[
      selected.quarter
    ] = buckets;
    selectedSources.push({
      grade: selected.grade,
      subject: selected.subject,
      quarter: selected.quarter,
      source: selected.sheetName,
      targetLessons:
        buckets.common.length + buckets.layered.length + buckets.target.length,
      eliteLessons:
        buckets.common.length + buckets.layered.length + buckets.elite.length,
      expected,
    });
  });
  return {
    library,
    summary: summarizeVideoLibrary(library, selectedSources),
    ignoredRows,
  };
}

function normalizeVideoQuarter(value, subject) {
  const label = String(value || "").replace(/\s+/g, "");
  if (/一轮/.test(label)) return "秋季";
  if (/二轮/.test(label)) return "春季";
  if (/秋/.test(label)) return "秋季";
  if (/春/.test(label)) return "春季";
  if (isHumanities(subject) && /暑|夏/.test(label)) return "秋季";
  if (isHumanities(subject) && /寒|冬/.test(label)) return "春季";
  return "";
}

function resolveVideoBucket(value, title) {
  const label = `${value || ""} ${title || ""}`;
  if (/菁英|精英|英才/.test(label)) return "elite";
  if (/目标/.test(label)) return "target";
  if (/^\s*是\s*/.test(String(value || ""))) return "layered";
  return "common";
}

function resolvedVideoCount(items) {
  const counts = { common: 0, target: 0, elite: 0, layered: 0 };
  items.forEach((item) => {
    counts[item.bucket] += 1;
  });
  return counts.common + counts.layered + Math.max(counts.target, counts.elite);
}

function summarizeVideoLibrary(library, sources) {
  const cells = sources.map((item) => ({
    ...item,
    valid:
      item.targetLessons === item.expected ||
      item.eliteLessons === item.expected,
  }));
  return {
    grades: Object.keys(library),
    subjects: [...new Set(cells.map((item) => item.subject))],
    quarters: [...new Set(cells.map((item) => item.quarter))],
    cells,
    sourceRows: cells.reduce(
      (sum, item) => sum + Math.max(item.targetLessons, item.eliteLessons),
      0,
    ),
  };
}

function isHumanities(subject) {
  return ["历史", "地理", "政治"].includes(subject);
}
function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
}

function parseGifts(rows, defaultGiftName = "精品赠课") {
  const result = {};
  rows.forEach((row) => {
    const subject = resolveSubject(row);
    if (!subject) return;
    const list = (result[subject] ||= []);
    if (Array.isArray(row.__rowValues)) {
      const lessonTitle = row.__rowValues
        .map((value) => String(value || "").trim())
        .find(Boolean);
      if (
        !lessonTitle ||
        /^(课程大纲|课程名称|课程内容|标题)$/.test(lessonTitle)
      )
        return;
      list.push({
        no: list.length + 1,
        giftName: defaultGiftName,
        title: lessonTitle,
        point: "重难点知识",
        lessonCount: 0,
        detail: `${subject}重点难点知识精讲`,
      });
      return;
    }
    const giftName = pick(row, ["赠课名称", "赠课项目", "赠课包名称"]);
    const lessonTitle = pick(row, [
      "课程名称",
      "课程内容",
      "课程大纲",
      "课题",
      "标题",
    ]);
    list.push({
      no:
        numberValue(pick(row, ["讲次", "序号", "课次", "节次"])) ||
        list.length + 1,
      giftName: giftName || lessonTitle || `赠课${list.length + 1}`,
      title: lessonTitle || giftName || `赠课${list.length + 1}`,
      point: pick(row, ["考点", "知识模块", "知识点", "模块"]),
      lessonCount: numberValue(pick(row, ["总课时", "课时数", "课时"])),
      detail:
        pick(row, ["赠课说明", "课程说明", "一句话介绍", "描述", "权益说明"]) ||
        "赠课权益按课程进度开放",
    });
  });
  return result;
}

function cleanGiftWorkbookName(filename) {
  return (
    String(filename || "精品赠课")
      .replace(/\.(xlsx?|csv)$/i, "")
      .replace(/[_-]?按科目拆分.*$/i, "")
      .replace(/[_-]?仅课程大纲.*$/i, "")
      .replace(/[_-]?新版.*$/i, "")
      .trim() || "精品赠课"
  );
}

function resolveSubject(row) {
  const explicit = String(pick(row, ["科目", "学科", "对应学科"]) || "");
  return (
    SUBJECTS.find((subject) => explicit.includes(subject)) ||
    SUBJECTS.find((subject) => String(row.__sheet).includes(subject)) ||
    ""
  );
}
function normalizeGrade(value) {
  return VALID_GRADES.find((grade) => String(value).includes(grade)) || "";
}
function normalizeQuarter(value) {
  const label = String(value || "");
  return (
    VALID_QUARTERS.find((quarter) => label.includes(quarter)) ||
    (label.includes("冬") ? "寒假" : label.includes("夏") ? "暑期" : "")
  );
}
function resolveTrack(value) {
  const label = String(value || "");
  if (/菁英|精英|英才/.test(label)) return "菁英班";
  if (/目标/.test(label)) return "目标班";
  return "不分班";
}
function pickExact(row, name) {
  const key = Object.keys(row).find(
    (item) => String(item).replace(/\s+/g, "") === name,
  );
  return key && row[key] !== "" ? String(row[key]).trim() : "";
}
function pick(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((item) =>
      String(item).replace(/\s+/g, "").includes(name),
    );
    if (key && row[key] !== "") return String(row[key]).trim();
  }
  return "";
}
function numberValue(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}
