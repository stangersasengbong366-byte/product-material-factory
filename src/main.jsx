import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import html2canvas from "html2canvas";
import { formatCourseDate } from "./dateFormat.js";
import { livePageKey, liveRowKey, updateLiveTemplateOverride } from "./liveTemplate.js";
import {
  CloudUpload,
  Download,
  DollarSign,
  Eye,
  FileSpreadsheet,
  Gift as GiftIcon,
  LayoutGrid,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { demoProduct } from "./data/demoProduct";
import { COURSE_SUBJECTS } from "./courseSubjects";
import {
  buildMaterialTasks,
  clearVideoPageRowOverrides,
  getLiveRows,
  getVideoRows,
  inferCoverageQuarters,
  loadProduct,
  normalizeProduct,
  saveProduct,
} from "./productStore";
import {
  cloudEnabled,
  cloudProviderName,
  loadCloudStudio,
  saveCloudStudio,
} from "./cloudRepository";
import { parseCourseWorkbook } from "./workbookParser";
import {
  expectedVideoLessonCount,
  VIDEO_QUARTERS,
} from "./courseRules";
import {
  COURSE_QUARTERS,
  formatCourseStage,
  formatCourseStages,
  sortCourseQuarters,
} from "./courseStages";
import { getTaskFilename, sanitizeFilenamePart } from "./exportNaming";
import { toChineseNumeral } from "./chineseNumerals";
import { getPriceTierCounts } from "./priceModes";
import "./styles.css";
import "./config.css";
import "./figma-templates.css";
import "./backend.css";
import "./live-config.css";
import "./live-poster-stage.css";
import "./workflow.css";
import "./grade-templates.css";
import "./video-outline-fit.css";
import "./video-config.css";
import "./gift-layout.css";
import "./template-color-fidelity.css";
import "./simple-backend.css";
import "./price-module.css";
import "./export.css";

const taskNavItems = [
  { type: "学法直播", icon: LayoutGrid },
  { type: "知识视频", icon: Video },
  { type: "赠课", icon: GiftIcon },
  { type: "价格", icon: DollarSign },
];

const assetUrl = (path) =>
  `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, "")}`;

const videoPageKey = (subject, track) => `${subject}::${track}`;

function annualLibraryFromProduct(product = {}) {
  return normalizeAnnualLibrary({
    uploadNames: {
      live: product.uploadNames?.live || "",
      video: product.uploadNames?.video || "",
    },
    liveLibrary: product.liveLibrary || {},
    liveImportSummary: product.liveImportSummary || null,
    liveImportIgnoredRows: product.liveImportIgnoredRows || 0,
    videoLibrary: product.videoLibrary || {},
    videoImportSummary: product.videoImportSummary || null,
    videoImportIgnoredRows: product.videoImportIgnoredRows || 0,
  });
}

function normalizeAnnualLibrary(value = {}) {
  return {
    uploadNames: {
      live: String(value.uploadNames?.live || ""),
      video: String(value.uploadNames?.video || ""),
    },
    liveLibrary: value.liveLibrary || {},
    liveImportSummary: value.liveImportSummary || null,
    liveImportIgnoredRows: Number(value.liveImportIgnoredRows || 0),
    videoLibrary: value.videoLibrary || {},
    videoImportSummary: value.videoImportSummary || null,
    videoImportIgnoredRows: Number(value.videoImportIgnoredRows || 0),
  };
}

function withAnnualLibrary(product, library) {
  if (!product) return product;
  return {
    ...product,
    ...normalizeAnnualLibrary(library),
    uploadNames: {
      ...(product.uploadNames || {}),
      ...normalizeAnnualLibrary(library).uploadNames,
    },
  };
}

function stripAnnualLibrary(product) {
  const {
    liveLibrary,
    liveImportSummary,
    liveImportIgnoredRows,
    videoLibrary,
    videoImportSummary,
    videoImportIgnoredRows,
    ...rest
  } = product;
  return {
    ...rest,
    uploadNames: { gift: product.uploadNames?.gift || "" },
  };
}

function App() {
  const localProduct = useMemo(() => loadProduct(), []);
  const [activeNav, setActiveNav] = useState("tasks");
  const [annualLibrary, setAnnualLibrary] = useState(() =>
    annualLibraryFromProduct(localProduct),
  );
  const [products, setProducts] = useState(() => [localProduct]);
  const [selectedProductId, setSelectedProductId] = useState(
    () => loadProduct().id,
  );
  const [syncState, setSyncState] = useState(
    cloudEnabled ? `正在读取 ${cloudProviderName}` : "未连接云端存储",
  );
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudLoadSettled, setCloudLoadSettled] = useState(!cloudEnabled);
  const [cloudRevision, setCloudRevision] = useState(null);
  const storedProduct =
    products.find((item) => item.id === selectedProductId) ?? products[0];
  const product = withAnnualLibrary(storedProduct, annualLibrary);
  const [taskTypeFilter, setTaskTypeFilter] = useState("学法直播");
  const allTasks = useMemo(() => buildMaterialTasks(product), [product]);
  const taskTypeStats = useMemo(
    () =>
      Object.fromEntries(
        taskNavItems.map(({ type }) => {
          const typeTasks = allTasks.filter((task) => task.type === type);
          return [
            type,
            {
              materials: typeTasks.length,
              lessons:
                type === "价格"
                  ? priceTotalLessons(product)
                  : typeTasks.reduce((sum, task) => sum + task.count, 0),
            },
          ];
        }),
      ),
    [allTasks, product],
  );
  const tasks = useMemo(
    () => allTasks.filter((item) => item.type === taskTypeFilter),
    [allTasks, taskTypeFilter],
  );
  const downloadableTasks = useMemo(
    () => tasks.filter((item) => item.count > 0),
    [tasks],
  );
  const [activeTaskId, setActiveTaskId] = useState(tasks[0]?.id ?? "");
  const [exportState, setExportState] = useState("idle");
  const [exportProgress, setExportProgress] = useState(null);
  const [batchPackage, setBatchPackage] = useState(null);
  const posterRef = useRef(null);
  const activeTask = tasks.find((item) => item.id === activeTaskId) ?? tasks[0];
  const rows =
    activeTask?.type === "学法直播"
      ? getLiveRows(product, activeTask.subject)
      : activeTask?.type === "知识视频"
        ? getVideoRows(product, activeTask.subject, activeTask.track)
        : (product.gifts?.[activeTask?.subject] ?? []);

  useEffect(() => {
    if (!cloudEnabled) return;
    loadCloudStudio({ signal: AbortSignal.timeout(15000) })
      .then((config) => {
        setCloudLoaded(true);
        if (!config?.products?.length) {
          if (window.location.hostname === "localhost") {
            setSyncState(`正在迁移本地配置到 ${cloudProviderName}`);
            return saveCloudStudio({
              products: products.map(stripAnnualLibrary),
              annualLibrary: normalizeAnnualLibrary(annualLibrary),
              cardTypes: [...new Set(products.map((item) => item.stage))],
            }, { revision: config?.revision }).then((result) => {
              setCloudRevision(result.revision);
              setSyncState(`本地配置已迁移 · ${products.length} 个产品`);
            });
          }
          setSyncState("云端暂无素材配置");
          return;
        }
        const nextAnnualLibrary = normalizeAnnualLibrary(
          config.annualLibrary || annualLibraryFromProduct(config.products[0]),
        );
        const nextProducts = config.products.map((item) =>
          normalizeProduct(withAnnualLibrary(item, nextAnnualLibrary)),
        );
        setAnnualLibrary(nextAnnualLibrary);
        setProducts(nextProducts);
        setCloudRevision(config.revision);
        setSelectedProductId((current) =>
          nextProducts.some((item) => item.id === current)
            ? current
            : nextProducts[0].id,
        );
        setSyncState(`云端已同步 · ${nextProducts.length} 个产品`);
      })
      .catch((error) => setSyncState(`云端读取失败：${error.name === "TimeoutError" ? "连接超时" : error.message}`))
      .finally(() => setCloudLoadSettled(true));
  }, []);

  useEffect(() => {
    setActiveTaskId((current) =>
      tasks.some((item) => item.id === current)
        ? current
        : (tasks[0]?.id ?? ""),
    );
  }, [selectedProductId, taskTypeFilter, tasks.length]);

  useEffect(
    () => () => {
      if (batchPackage?.url) URL.revokeObjectURL(batchPackage.url);
    },
    [batchPackage],
  );

  useEffect(() => {
    setBatchPackage(null);
  }, [selectedProductId, taskTypeFilter]);

  const updateProduct = (next) => {
    const normalized = normalizeProduct(next);
    setProducts((current) =>
      current.map((item) => (item.id === normalized.id ? normalized : item)),
    );
    saveProduct(normalized);
    const nextTasks = buildMaterialTasks(normalized);
    setActiveTaskId((current) =>
      nextTasks.some((item) => item.id === current)
        ? current
        : (nextTasks[0]?.id ?? ""),
    );
  };

  const saveAllToCloud = async (
    nextProducts = products,
    nextAnnualLibrary = annualLibrary,
    options = {},
  ) => {
    setSyncState("正在保存云端");
    try {
      const result = await saveCloudStudio({
        products: nextProducts.map(stripAnnualLibrary),
        annualLibrary: normalizeAnnualLibrary(nextAnnualLibrary),
        cardTypes: [...new Set(nextProducts.map((item) => item.stage))],
      }, {
        ...options,
        revision: options.revision ?? cloudRevision,
      });
      setCloudRevision(result.revision);
      setSyncState(`云端已保存 · ${nextProducts.length} 个产品`);
    } catch (error) {
      setSyncState(`保存失败：${error.message}`);
      throw error;
    }
  };

  const addProduct = (stage) => {
    const next = normalizeProduct({
      id: `product-${Date.now()}`,
      name: `${stage}产品`,
      grade: "高一",
      stage,
      coverageQuarters: inferCoverageQuarters(stage),
      ...annualLibrary,
      live: {},
      video: {},
      gifts: {},
    });
    setProducts((current) => [...current, next]);
    setSelectedProductId(next.id);
  };

  const deleteProduct = (id) => {
    if (products.length === 1) return;
    const next = products.filter((item) => item.id !== id);
    setProducts(next);
    setSelectedProductId(next[0].id);
  };

  const openTaskType = (type) => {
    setTaskTypeFilter(type);
    setActiveNav("tasks");
  };

  const exportCurrent = async () => {
    if (
      !activeTask ||
      !activeTask.count ||
      !posterRef.current ||
      exportState !== "idle"
    )
      return;
    setExportState("single");
    try {
      const blob = await renderPoster(posterRef.current);
      downloadBlob(blob, getTaskFilename(product, activeTask));
    } catch (error) {
      setSyncState(`下载失败：${error.message}`);
      console.error("单张素材下载失败", error);
    } finally {
      setExportState("idle");
    }
  };

  const exportAll = async () => {
    if (!downloadableTasks.length || exportState !== "idle") return;
    setExportState("batch");
    setExportProgress({ current: 0, total: downloadableTasks.length });
    setBatchPackage(null);
    setSyncState(`正在批量生成 · 0/${downloadableTasks.length}`);
    const previousTaskId = activeTaskId;
    try {
      const zip = new JSZip();
      const folder = zip.folder(sanitizeFilenamePart(product.name));
      for (const [index, task] of downloadableTasks.entries()) {
        setActiveTaskId(task.id);
        await nextPaint();
        if (!posterRef.current)
          throw new Error(`${task.subject}素材画布尚未准备完成`);
        const blob = await renderPosterWith(html2canvas, posterRef.current);
        folder.file(getTaskFilename(product, task), blob);
        setExportProgress({
          current: index + 1,
          total: downloadableTasks.length,
        });
        setSyncState(
          `正在批量生成 · ${index + 1}/${downloadableTasks.length}`,
        );
      }
      const bundle = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const filename = `${sanitizeFilenamePart(product.name)}_课程素材_${formatDate()}.zip`;
      const url = URL.createObjectURL(bundle);
      setBatchPackage({ url, filename, count: downloadableTasks.length });
      triggerDownload(url, filename);
      setSyncState(`批量下载完成 · ${downloadableTasks.length} 张素材`);
    } catch (error) {
      setSyncState(`批量下载失败：${error.message}`);
      console.error("批量素材下载失败", error);
    } finally {
      setActiveTaskId(previousTaskId);
      setExportProgress(null);
      setExportState("idle");
    }
  };

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <div className="brand-mark">领</div>
          <div>
            <strong>课程素材工厂</strong>
            <span>Course Material Studio</span>
          </div>
        </div>
        <nav className="sidebar-navigation">
          <button
            className={activeNav === "courses" ? "active" : ""}
            onClick={() => setActiveNav("courses")}
          >
            <FileSpreadsheet size={18} />
            <span>课程配置</span>
          </button>
          <div className="sidebar-task-group">
            <div className="sidebar-task-heading">
              <LayoutGrid size={15} />
              <span>素材任务</span>
            </div>
            {taskNavItems.map(({ type, icon: Icon }) => (
              <button
                key={type}
                className={
                  (activeNav === "tasks" || activeNav === "price-config") && taskTypeFilter === type
                    ? "task-subnav active"
                    : "task-subnav"
                }
                onClick={() => openTaskType(type)}
              >
                <Icon size={16} />
                <span>{type}</span>
                <em>{taskTypeStats[type].materials}张</em>
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-product">
          <span>当前产品</span>
          <strong>{product.name}</strong>
          <small>
            {product.grade} · {product.stage}
          </small>
        </div>
        <button className="sidebar-settings">
          <Settings2 size={17} />
          系统设置
        </button>
      </aside>

      <main className="studio-main">
        <header className="studio-topbar">
          <div>
            <span className="eyebrow">素材生产工作台</span>
            <h1>{pageTitle(activeNav)}</h1>
            <small className="cloud-state">{syncState}</small>
          </div>
          {activeNav === "tasks" ? (
            <div className="topbar-actions">
              <button className="ghost" onClick={() => setActiveNav(taskTypeFilter === "价格" ? "price-config" : "courses")}>
                <CloudUpload size={17} />
                {taskTypeFilter === "价格" ? "价格配置" : "课程配置"}
              </button>
              <button
                className="primary"
                onClick={exportAll}
                disabled={!downloadableTasks.length || exportState !== "idle"}
              >
                {exportState === "batch" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
                {exportState === "batch"
                  ? `正在生成 ${exportProgress?.current || 0}/${exportProgress?.total || downloadableTasks.length}`
                  : `批量下载 ${downloadableTasks.length}张`}
              </button>
              {batchPackage && exportState === "idle" ? (
                <a
                  className="batch-ready"
                  href={batchPackage.url}
                  download={batchPackage.filename}
                  onClick={() =>
                    setSyncState(
                      `已重新下载 · ${batchPackage.count} 张素材`,
                    )
                  }
                >
                  <Download size={17} />
                  下载已生成压缩包
                </a>
              ) : null}
            </div>
          ) : null}
        </header>

        {activeNav === "tasks" && (
          <TaskWorkspace
            products={products}
            product={product}
            onSelectProduct={setSelectedProductId}
            tasks={tasks}
            allTasks={allTasks}
            taskTypeFilter={taskTypeFilter}
            activeTask={activeTask}
            activeTaskId={activeTaskId}
            setActiveTaskId={setActiveTaskId}
            rows={rows}
            posterRef={posterRef}
            exportCurrent={exportCurrent}
            exportState={exportState}
            onUpdateProduct={updateProduct}
            onSaveCloud={saveAllToCloud}
            cloudLoaded={cloudLoaded}
            cloudLoadSettled={cloudLoadSettled}
          />
        )}
        {activeNav === "courses" && (
          <CourseConfig
            products={products}
            product={product}
            selectedProductId={selectedProductId}
            onSelect={setSelectedProductId}
            onSave={updateProduct}
            onSaveCloud={saveAllToCloud}
            annualLibrary={annualLibrary}
            onAnnualLibraryChange={setAnnualLibrary}
            onAdd={addProduct}
            onDelete={deleteProduct}
          />
        )}
        {activeNav === "price-config" && (
          <PriceConfigPage
            products={products}
            product={product}
            selectedProductId={selectedProductId}
            onSelect={setSelectedProductId}
            onSave={updateProduct}
            onSaveCloud={saveAllToCloud}
            onBack={() => setActiveNav("tasks")}
          />
        )}
      </main>
    </div>
  );
}

function TaskWorkspace({
  products,
  product,
  onSelectProduct,
  tasks,
  allTasks,
  taskTypeFilter,
  activeTask,
  activeTaskId,
  setActiveTaskId,
  rows,
  posterRef,
  exportCurrent,
  exportState,
  onUpdateProduct,
  onSaveCloud,
  cloudLoaded,
  cloudLoadSettled,
}) {
  const [liveEditing, setLiveEditing] = useState(false);
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [giftEditing, setGiftEditing] = useState(false);
  const [giftSaving, setGiftSaving] = useState(false);
  const [priceEditing, setPriceEditing] = useState(false);
  const [priceSaving, setPriceSaving] = useState(false);
  const [videoEditing, setVideoEditing] = useState(false);
  const [videoSaving, setVideoSaving] = useState(false);
  const typeStats = Object.fromEntries(
    ["学法直播", "知识视频", "赠课", "价格"].map((type) => [
      type,
      {
        materials: allTasks.filter((task) => task.type === type).length,
        lessons:
          type === "价格"
            ? priceTotalLessons(product)
            : allTasks
                .filter((task) => task.type === type)
                .reduce((sum, task) => sum + task.count, 0),
      },
    ]),
  );
  useEffect(() => {
    setLiveEditing(false);
    setLiveMessage("");
    setGiftEditing(false);
    setPriceEditing(false);
    setVideoEditing(false);
  }, [activeTaskId, product.id]);
  const updateLiveCopy = (change) => {
    if (activeTask?.type !== "学法直播") return;
    try {
      onUpdateProduct({
        ...product,
        liveTemplateOverride: updateLiveTemplateOverride(
          product.liveTemplateOverride,
          { ...change, pageKey: livePageKey(product, activeTask.subject) },
        ),
      });
      setLiveMessage("修改已保存到本机，下载将使用修改后的内容；共享给同事请保存云端。");
    } catch (error) {
      setLiveMessage(`本机保存失败：${error.message}。请先下载素材保留修改。`);
    }
  };
  const saveLiveCopy = async () => {
    if (!cloudLoaded || liveSaving) return;
    setLiveSaving(true);
    setLiveMessage("正在保存云端…");
    try {
      await onSaveCloud(undefined, undefined, { signal: AbortSignal.timeout(15000) });
      setLiveMessage("母版已保存云端，同事刷新页面后可读取。");
    } catch (error) {
      setLiveMessage(`云端保存失败${error.name === "TimeoutError" ? "：连接超时" : `：${error.message}`}。本机修改仍保留，可继续下载 PNG。`);
    } finally {
      setLiveSaving(false);
    }
  };
  const updateGiftCopy = (patch) => {
    if (activeTask?.type !== "赠课") return;
    const templatePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) => ["name", "intro"].includes(key)),
    );
    onUpdateProduct({
      ...product,
      giftTemplateOverride: {
        ...(product.giftTemplateOverride || {}),
        ...templatePatch,
      },
    });
  };
  const saveGiftCopy = async () => {
    setGiftSaving(true);
    try { await onSaveCloud(); }
    finally { setGiftSaving(false); }
  };
  const updatePriceCopy = (patch) => {
    if (activeTask?.type !== "价格") return;
    const templatePatch = Object.fromEntries(
      Object.entries(patch).filter(([key]) =>
        ["titleGrade", "titleProduct", "titleSuffix", "subjectScope", "wenZongSubjectScope", "tag", "wenZongTag", "wenZongCourseLabel"].includes(key),
      ),
    );
    onUpdateProduct({
      ...product,
      priceConfig: {
        ...(product.priceConfig || {}),
        ...templatePatch,
      },
    });
  };
  const savePriceCopy = async () => {
    setPriceSaving(true);
    try { await onSaveCloud(); }
    finally { setPriceSaving(false); }
  };
  const updateVideoCopy = ({ scope, patch }) => {
    if (activeTask?.type !== "知识视频") return;
    const current = product.videoTemplateOverride || {};
    if (scope === "template") {
      onUpdateProduct({
        ...product,
        videoTemplateOverride: { ...current, ...patch },
      });
      return;
    }
    const key = videoPageKey(activeTask.subject, activeTask.track);
    onUpdateProduct({
      ...product,
      videoTemplateOverride: {
        ...current,
        pages: {
          ...(current.pages || {}),
          [key]: { ...(current.pages?.[key] || {}), ...patch },
        },
      },
    });
  };
  const saveVideoCopy = async () => {
    setVideoSaving(true);
    try { await onSaveCloud(); }
    finally { setVideoSaving(false); }
  };
  return (
    <>
      <section className="production-setup">
        <div className="production-step">
          <span>01</span>
          <label>
            选择后台已配置产品
            <select
              value={product.id}
              onChange={(event) => onSelectProduct(event.target.value)}
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.grade}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="selected-product-info">
          <div>
            <small>产品名称</small>
            <strong>{product.name}</strong>
          </div>
          <div>
            <small>年级 / 卡型</small>
            <strong>
              {product.grade} · {product.stage}
            </strong>
          </div>
          <div>
            <small>覆盖阶段</small>
            <strong>{formatCourseStages(product.grade, product.coverageQuarters)}</strong>
          </div>
        </div>
        <div className="production-type-summary">
          <div>
            <small>当前课表类型</small>
            <strong>{taskTypeFilter}</strong>
          </div>
          <div>
            <small>{taskTypeFilter === "价格" ? "课程权益课时" : "总课时"}</small>
            <strong>{typeStats[taskTypeFilter].lessons}课时</strong>
          </div>
          <div>
            <small>预计素材</small>
            <strong>{typeStats[taskTypeFilter].materials}张</strong>
          </div>
          <p>
            已按 {formatCourseStages(product.grade, product.coverageQuarters) || "未选择阶段"}
            自动映射；课时合计来自下方全部素材任务。
          </p>
        </div>
      </section>
      <section className="workbench">
        <div className="task-panel">
          <div className="panel-title">
            <div>
              <span>
                {typeStats[taskTypeFilter].lessons}课时 · 共
                {typeStats[taskTypeFilter].materials}张素材
              </span>
              <strong>{taskTypeFilter}生产清单</strong>
            </div>
          </div>
          <div className="task-list">
            {tasks.map((task, index) => (
              <button
                key={task.id}
                onClick={() => setActiveTaskId(task.id)}
                className={task.id === activeTaskId ? "active" : ""}
              >
                <span className="task-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>
                    {task.subject} · {task.type}
                  </strong>
                  <small>
                    {task.track} · {task.type === "价格" ? "1张价格表" : `${task.count}课时`}
                  </small>
                </div>
                <em>{task.count ? "可生成" : "缺数据"}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="preview-panel">
          <div className="preview-toolbar">
            <div>
              <Eye size={17} />
              <span>{activeTask?.type === "赠课" ? "赠课母版预览" : activeTask?.type === "价格" ? "价格母版预览" : activeTask?.type === "知识视频" ? "知识视频母版预览" : activeTask?.type === "学法直播" ? "学法直播母版预览" : "素材预览"}</span>
              <em>{activeTask?.type === "赠课" ? "自动同步全部学科" : activeTask?.type === "价格" ? "自动同步全部价格素材" : activeTask?.type === "知识视频" ? "顶部母版同步，课程内容按当前素材保存" : product.name}</em>
            </div>
            <div className="preview-actions">
            {activeTask?.type === "学法直播" && rows.length > 0 ? (
              <>
                <button
                  className={liveEditing ? "active" : ""}
                  aria-pressed={liveEditing}
                  onClick={() => setLiveEditing((value) => !value)}
                  disabled={exportState !== "idle" || liveSaving || !cloudLoadSettled}
                >
                  {liveEditing ? "完成编辑" : "编辑母版"}
                </button>
                <button
                  onClick={saveLiveCopy}
                  disabled={liveSaving || !cloudLoaded || exportState !== "idle"}
                  title={!cloudLoaded ? "云端尚未连接，修改可保存在本机并下载" : "保存当前产品的母版修改到云端"}
                >
                  {liveSaving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                  保存云端
                </button>
              </>
            ) : null}
            {activeTask?.type === "赠课" ? (
              <>
                <button className={giftEditing ? "active" : ""} onClick={() => setGiftEditing((value) => !value)}>
                  {giftEditing ? "完成编辑" : "编辑母版"}
                </button>
                <button onClick={saveGiftCopy} disabled={giftSaving}>
                  {giftSaving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                  保存云端
                </button>
              </>
            ) : null}
            {activeTask?.type === "价格" ? (
              <>
                <button className={priceEditing ? "active" : ""} onClick={() => setPriceEditing((value) => !value)}>
                  {priceEditing ? "完成编辑" : "编辑母版"}
                </button>
                <button onClick={savePriceCopy} disabled={priceSaving}>
                  {priceSaving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                  保存云端
                </button>
              </>
            ) : null}
            {activeTask?.type === "知识视频" ? (
              <>
                <button className={videoEditing ? "active" : ""} onClick={() => setVideoEditing((value) => !value)}>
                  {videoEditing ? "完成编辑" : "编辑母版"}
                </button>
                <button onClick={saveVideoCopy} disabled={videoSaving}>
                  {videoSaving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                  保存云端
                </button>
              </>
            ) : null}
            <button
              onClick={exportCurrent}
              disabled={!activeTask?.count || exportState !== "idle"}
            >
              {exportState === "single" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              下载 PNG
            </button>
            </div>
          </div>
          {activeTask?.type === "学法直播" && rows.length > 0 ? (
            <div className="live-edit-help">
              <span>{liveEditing
                ? "点击虚线框编辑，按回车或点击空白处保存。标题、说明、表头应用于本产品全部学科；课时、日期、序号、课名只修改当前科目。"
                : "点击“编辑母版”，可直接修改预览中的文字、课时、上课时间、日期和课程内容。"}</span>
              <span role="status">{liveMessage || (!cloudLoadSettled ? "正在读取云端配置，读取结束后可编辑。" : !cloudLoaded ? "云端尚未连接；可先编辑并下载，暂不能共享给同事。" : "")}</span>
            </div>
          ) : null}
          <div className="preview-canvas">
            <div className="material-scale">
              {activeTask?.type === "学法直播" && !rows.length ? (
                <div className="empty-state">
                  {activeTask.subject}已补充到学法直播科目列表，当前全年课程库暂无该科课表数据。
                </div>
              ) : activeTask ? (
                renderTaskPoster(activeTask, product, rows, posterRef, {
                  liveEditing: liveEditing && !liveSaving && exportState === "idle",
                  onLiveCopyChange: updateLiveCopy,
                  giftEditing,
                  onGiftCopyChange: updateGiftCopy,
                  priceEditing,
                  onPriceCopyChange: updatePriceCopy,
                  videoEditing,
                  onVideoCopyChange: updateVideoCopy,
                })
              ) : (
                <div className="empty-state">
                  该产品暂无{taskTypeFilter}任务，请返回课程配置上传对应底表
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CourseConfig({
  products,
  product,
  annualLibrary,
  selectedProductId,
  onSelect,
  onSave,
  onSaveCloud,
  onAnnualLibraryChange,
  onAdd,
  onDelete,
}) {
  const [draft, setDraft] = useState(product);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(product), [product.id]);
  const cardTypes = [...new Set(products.map((item) => item.stage))];
  const selectedCard = product.stage;
  const cardProducts = products.filter((item) => item.stage === selectedCard);

  const uploadWorkbook = async (event, type) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(`正在解析 ${file.name}`);
    try {
      const parsed = await parseCourseWorkbook(file, type);
      const annualNames = {
        ...(annualLibrary.uploadNames || {}),
        [type]: file.name,
      };
      const productNames = { ...(draft.uploadNames || {}), [type]: file.name };
      const next =
        type === "live"
          ? {
              ...draft,
              liveLibrary: parsed.library,
              liveImportSummary: parsed.summary,
              liveImportIgnoredRows: parsed.ignoredRows,
              uploadNames: { ...draft.uploadNames, live: file.name },
            }
          : type === "video"
            ? {
                ...draft,
                videoLibrary: parsed.library,
                videoImportSummary: parsed.summary,
                videoImportIgnoredRows: parsed.ignoredRows,
                videoTemplateOverride: clearVideoPageRowOverrides(
                  draft.videoTemplateOverride,
                ),
                uploadNames: { ...draft.uploadNames, video: file.name },
              }
            : { ...draft, gifts: parsed, uploadNames: productNames };
      if (type === "live" || type === "video") {
        onAnnualLibraryChange(
          normalizeAnnualLibrary({
            ...annualLibrary,
            uploadNames: annualNames,
            ...(type === "live"
              ? {
                  liveLibrary: parsed.library,
                  liveImportSummary: parsed.summary,
                  liveImportIgnoredRows: parsed.ignoredRows,
                }
              : {
                  videoLibrary: parsed.library,
                  videoImportSummary: parsed.summary,
                  videoImportIgnoredRows: parsed.ignoredRows,
                }),
          }),
        );
      }
      setDraft(next);
      setMessage(
        type === "live"
          ? `${file.name} 已形成全年库：识别 ${parsed.summary.subjects.join("、")}，共 ${parsed.summary.cells.length} 个年级/阶段、${parsed.summary.lessonRows} 节课${parsed.summary.missingSubjects?.length ? `；未识别科目：${parsed.summary.missingSubjects.join("、")}` : "；9 个科目均已识别"}`
          : type === "video"
            ? `${file.name} 已形成知识视频库：${parsed.summary.grades.length} 个年级 × ${parsed.summary.subjects.length} 个科目，${parsed.summary.cells.length} 个阶段单元；课程海报内容已按新底表刷新`
            : `${file.name} 已解析：${countParsed(parsed, type)} 条课程`,
      );
    } catch (error) {
      setMessage(`解析失败：${error.message}`);
    }
    event.target.value = "";
  };

  const saveAll = async () => {
    setSaving(true);
    const normalized = normalizeProduct(draft);
    onSave(normalized);
    const nextProducts = products.map((item) =>
      item.id === normalized.id ? normalized : item,
    );
    try {
      const nextAnnualLibrary = normalizeAnnualLibrary({
        ...annualLibrary,
        liveLibrary: normalized.liveLibrary,
        liveImportSummary: normalized.liveImportSummary,
        liveImportIgnoredRows: normalized.liveImportIgnoredRows,
        videoLibrary: normalized.videoLibrary,
        videoImportSummary: normalized.videoImportSummary,
        videoImportIgnoredRows: normalized.videoImportIgnoredRows,
      });
      await onSaveCloud(nextProducts, nextAnnualLibrary);
      setMessage(`产品、全年课程库和赠课映射已保存到 ${cloudProviderName}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="catalog-admin">
      <aside className="card-catalog">
        <div className="catalog-title">
          <span>按卡型管理</span>
          <strong>产品目录</strong>
        </div>
        {cardTypes.map((stage) => (
          <div className="card-type-group" key={stage}>
            <button
              className={
                stage === selectedCard ? "card-type active" : "card-type"
              }
              onClick={() =>
                onSelect(products.find((item) => item.stage === stage)?.id)
              }
            >
              <span>{stage}</span>
              <em>{products.filter((item) => item.stage === stage).length}</em>
            </button>
            {stage === selectedCard ? (
              <div className="card-products">
                {cardProducts.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === selectedProductId ? "active" : ""}
                    onClick={() => onSelect(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>{item.grade}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button
          className="add-product-button"
          onClick={() => onAdd(selectedCard || "新卡型")}
        >
          <Plus size={16} />
          新建产品
        </button>
      </aside>
      <div className="product-config-content">
        <div className="config-card">
          <div className="config-heading">
            <div>
              <span>
                {selectedCard} / {draft.grade}
              </span>
              <h2>{draft.name}</h2>
            </div>
            <div className="config-heading-actions">
              <button
                className="delete-config"
                onClick={() => onDelete(draft.id)}
                disabled={products.length === 1}
              >
                <Trash2 size={16} />
                删除
              </button>
              <button onClick={saveAll} disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                保存到云端
              </button>
            </div>
          </div>
          <div className="config-grid">
            <label>
              产品名称
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              年级
              <select
                value={draft.grade}
                onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
              >
                {["高一", "高二", "高三"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              卡型
              <input
                value={draft.stage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    stage: e.target.value,
                    coverageQuarters: inferCoverageQuarters(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </div>
        <div className="workbook-section-heading annual-library-heading">
          <div>
            <strong>全年课程底表</strong>
            <span>全产品共用，只需上传一次并长期保存到云端</span>
          </div>
        </div>
        <div className="workbook-grid annual-workbook-grid">
          <WorkbookSlot
            type="live"
            title="学法直播底表"
            description="上传全年直播课程大纲"
            filename={annualLibrary.uploadNames?.live}
            count={
              annualLibrary.liveImportSummary?.lessonRows ||
              countParsed(draft.live, "live")
            }
            onChange={uploadWorkbook}
          />
          <WorkbookSlot
            type="video"
            title="知识视频底表"
            description="上传全年知识视频大纲"
            filename={annualLibrary.uploadNames?.video}
            count={
              annualLibrary.videoImportSummary?.sourceRows ||
              countParsed(draft.video, "video")
            }
            onChange={uploadWorkbook}
          />
        </div>
        {message ? <div className="config-message">{message}</div> : null}
        <StageMapping draft={draft} setDraft={setDraft} />
        <LiveAssociationEditor draft={draft} setDraft={setDraft} />
        <VideoAssociationSummary draft={draft} />
        <div className="workbook-section-heading product-gift-heading">
          <div>
            <strong>本产品赠课</strong>
            <span>赠课独立上传，仅关联当前产品</span>
          </div>
        </div>
        <div className="workbook-grid product-gift-grid">
          <WorkbookSlot
            type="gift"
            title="赠课底表"
            description="按9个科目 Sheet 上传赠课大纲"
            filename={draft.uploadNames?.gift}
            count={countParsed(draft.gifts, "gift")}
            onChange={uploadWorkbook}
          />
        </div>
        <GiftAssociationSummary draft={draft} />
      </div>
    </section>
  );
}

function PriceConfigPage({
  products,
  product,
  selectedProductId,
  onSelect,
  onSave,
  onSaveCloud,
  onBack,
}) {
  const [draft, setDraft] = useState(product);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(product), [product.id]);
  const savePrice = async () => {
    setSaving(true);
    const normalized = normalizeProduct(draft);
    onSave(normalized);
    const nextProducts = products.map((item) =>
      item.id === normalized.id ? normalized : item,
    );
    try {
      await onSaveCloud(nextProducts);
      setMessage(`价格配置已保存到 ${cloudProviderName}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="price-admin-page">
      <div className="price-admin-toolbar">
        <label>
          选择需要配置价格的产品
          <select value={selectedProductId} onChange={(event) => onSelect(event.target.value)}>
            {products.map((item) => (
              <option value={item.id} key={item.id}>{item.name} · {item.grade}</option>
            ))}
          </select>
        </label>
        <div>
          <button className="ghost" onClick={onBack}>返回价格素材</button>
          <button className="primary" onClick={savePrice} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
            {saving ? "正在保存" : "保存价格配置"}
          </button>
        </div>
      </div>
      <div className="price-admin-product">
        <span>当前产品</span>
        <strong>{draft.name}</strong>
        <em>{draft.grade} · {draft.stage} · {formatCourseStages(draft.grade, draft.coverageQuarters)}</em>
      </div>
      <PriceConfigEditor draft={draft} setDraft={setDraft} />
      {message ? <div className="config-message">{message}</div> : null}
    </section>
  );
}

function PriceConfigEditor({ draft, setDraft }) {
  const price = draft.priceConfig || {};
  const update = (field, value) =>
    setDraft({
      ...draft,
      priceConfig: { ...price, [field]: value },
    });
  const textField = (label, field, type = "text") => (
    <label>{label}<input type={type} value={price[field] || (type === "number" ? 0 : "")} onChange={(e) => update(field, type === "number" ? Number(e.target.value) : e.target.value)} /></label>
  );
  return <div className="price-config-stack">
    <section className="config-card price-config-card">
      <div className="config-heading"><div><span>价格表标题</span><h2>顶部文案与展示信息</h2></div><em>{priceTotalLessons(draft)} 课时权益</em></div>
      <div className="price-config-grid">
        {textField("年级标题", "titleGrade")}{textField("产品标题", "titleProduct")}{textField("第二行标题", "titleSuffix")}
        {textField("标题下方适用科目", "subjectScope")}{textField("右上角标签", "tag")}
      </div>
    </section>
    <div className="price-audience-grid">
      <section className="price-audience-column non-wenzong-column">
        <header><span>非文综</span><strong>阶梯价格与课程权益</strong><em>语数英物化生等单科组合</em></header>
        <div className="price-column-block">
          <div className="price-fieldset-heading"><strong>非文综价格</strong><span>三科至六科统一使用“三科及以上价/科”</span></div>
          <div className="price-config-grid">{textField("官网价/科", "officialUnitPrice", "number")}{textField("单科价", "tier1", "number")}{textField("两科价/科", "tier2", "number")}{textField("三科及以上价/科", "tier3", "number")}</div>
        </div>
        <div className="price-column-block">
          <div className="price-fieldset-heading"><strong>非文综课程包含</strong><span>课时与赠送内容独立维护</span></div>
          <div className="price-module-editor"><div><strong>知识视频</strong>{textField("课时量", "knowledgeHours", "number")}{textField("赠送内容", "knowledgeGift")}</div><div><strong>学法直播</strong>{textField("课时量", "liveHours", "number")}{textField("赠送内容", "liveGift")}</div><div><strong>辅导服务</strong>{textField("课时量 / 服务", "serviceText")}{textField("服务期", "servicePeriod")}{textField("赠送内容", "serviceGift")}</div></div>
        </div>
      </section>
      <section className="price-audience-column wenzong-column">
        <header><span>文综</span><strong>一口价格与课程权益</strong><em>政治、历史、地理单独维护</em></header>
        <div className="price-column-block">
          <div className="price-fieldset-heading"><strong>文综价格</strong><span>无文综、同价或一口价</span></div>
          <div className="price-config-grid"><label>文综状态<select value={price.wenZongMode || "none"} onChange={(e) => update("wenZongMode", e.target.value)}><option value="none">无文综</option><option value="same">文综与非文综同价</option><option value="deal">文综一口价</option></select></label>{textField("文综适用科目", "wenZongSubjectScope")}{textField("文综右上角标签", "wenZongTag")}{textField("文综课程名称", "wenZongCourseLabel")}{textField("文综官网原价/科", "wenZongOfficialUnitPrice", "number")}{textField("文综一口价/科", "wenZongDealUnitPrice", "number")}</div>
        </div>
        <div className="price-column-block">
          <div className="price-fieldset-heading"><strong>文综课程包含</strong><span>如与非文综不同可单独维护</span></div>
          <div className="price-module-editor"><div><strong>知识视频</strong>{textField("课时量", "wenZongKnowledgeHours")}{textField("赠送内容", "wenZongKnowledgeGift")}</div><div><strong>学法直播</strong>{textField("课时量", "wenZongLiveHours")}{textField("赠送内容", "wenZongLiveGift")}</div><div><strong>辅导服务</strong>{textField("课时量 / 服务", "wenZongServiceText")}{textField("赠送内容", "wenZongServiceGift")}</div></div>
        </div>
      </section>
    </div>
    <section className="config-card price-config-card">
      <div className="price-fieldset-heading"><strong>说明内容</strong><span>每行一条，显示在价格表底部</span></div>
      <label className="price-notes-field">说明内容<textarea value={(price.notes || []).join("\n")} onChange={(e) => update("notes", e.target.value.split("\n").filter(Boolean))} /></label>
    </section>
  </div>;
}

function StageMapping({ draft, setDraft }) {
  const quarters = COURSE_QUARTERS;
  return (
    <div className="config-card stage-mapping-card">
      <div className="config-heading">
        <div>
          <span>课程映射</span>
          <h2>选择产品覆盖阶段</h2>
        </div>
      </div>
      <div className="quarter-options">
        {quarters.map((quarter) => (
          <button
            type="button"
            className={draft.coverageQuarters.includes(quarter) ? "active" : ""}
            key={quarter}
            onClick={() =>
              setDraft({
                ...draft,
                coverageQuarters: draft.coverageQuarters.includes(quarter)
                  ? draft.coverageQuarters.filter((item) => item !== quarter)
                  : quarters.filter((item) =>
                      [...draft.coverageQuarters, quarter].includes(item),
                    ),
              })
            }
          >
            {formatCourseStage(draft.grade, quarter)}
          </button>
        ))}
      </div>
    </div>
  );
}

function LiveAssociationEditor({ draft, setDraft }) {
  const quarters = COURSE_QUARTERS;
  const mappedQuarters = quarters.filter((quarter) =>
    draft.coverageQuarters.includes(quarter),
  );
  const importedSubjects = Object.keys(
    draft.liveLibrary?.[draft.grade] || {},
  );
  const subjects = importedSubjects.length
    ? COURSE_SUBJECTS
    : Object.keys(draft.live || {});
  const [subject, setSubject] = useState(subjects[0] || "语文");
  const [editingQuarter, setEditingQuarter] = useState(
    mappedQuarters[0] || "",
  );
  useEffect(() => {
    if (subjects.length && !subjects.includes(subject)) setSubject(subjects[0]);
  }, [draft.grade, subjects.join("|")]);
  useEffect(() => {
    if (!mappedQuarters.includes(editingQuarter))
      setEditingQuarter(mappedQuarters[0] || "");
  }, [mappedQuarters.join("|")]);
  const subjectLibrary = draft.liveLibrary?.[draft.grade]?.[subject] || {};
  const stageLibrary = subjectLibrary[editingQuarter] || {};
  const rows =
    stageLibrary["一期"] ||
    Object.values(stageLibrary).find((item) => item?.length) ||
    [];
  const annualCount = quarters.reduce((total, quarter) => {
    const stage = subjectLibrary[quarter] || {};
    return (
      total +
      (stage["一期"] || Object.values(stage).find((item) => item?.length) || [])
        .length
    );
  }, 0);
  const updateRow = (row, field, value) => {
    const nextLibrary = structuredClone(draft.liveLibrary || {});
    const stage = nextLibrary?.[draft.grade]?.[subject]?.[editingQuarter] || {};
    const list =
      stage["一期"] || Object.values(stage).find((item) => item?.length);
    if (!list) return;
    const target = list[row.no - 1];
    if (target) target[field] = value;
    if (field === "title") {
      Object.values(stage).forEach((batchRows) => {
        if (batchRows?.[row.no - 1]) batchRows[row.no - 1].title = value;
      });
    }
    if (field === "time" && ["秋季", "寒假", "春季"].includes(editingQuarter)) {
      ["秋季", "寒假", "春季"].forEach((quarter) => {
        const relatedStage =
          nextLibrary?.[draft.grade]?.[subject]?.[quarter] || {};
        Object.values(relatedStage).forEach((batchRows) =>
          batchRows?.forEach((item) => {
            item.time = value;
          }),
        );
      });
    }
    setDraft({ ...draft, liveLibrary: nextLibrary });
  };
  return (
    <div className="config-card live-association">
      <div className="config-heading">
        <div>
          <span>学法直播</span>
          <h2>课程大纲映射</h2>
        </div>
        <em>
          {draft.grade} · 全年 {annualCount} 节/科
        </em>
      </div>
      <div className="live-controls">
        <label>
          科目
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="annual-outline-bar">
        <div className="annual-stage-tabs">
          {mappedQuarters.map((quarter) => {
            const stage = subjectLibrary[quarter] || {};
            const count = (
              stage["一期"] ||
              Object.values(stage).find((item) => item?.length) ||
              []
            ).length;
            return (
              <button
                type="button"
                className={editingQuarter === quarter ? "active" : ""}
                key={quarter}
                onClick={() => setEditingQuarter(quarter)}
              >
                {formatCourseStage(draft.grade, quarter)}
                <small>{count} 节</small>
              </button>
            );
          })}
        </div>
      </div>
      {!rows.length ? (
        <div className="live-empty">
          {mappedQuarters.length
            ? "全年课程库中暂无该阶段的学法直播大纲。"
            : "请先选择当前产品覆盖的阶段。"}
        </div>
      ) : null}
      {rows.length ? (
        <div className="live-edit-table">
          <div>
            <span>课次</span>
            <span>日期</span>
            <span>时间</span>
            <span>课程大纲</span>
          </div>
          {rows.map((row, index) => (
            <div key={`${row.quarter}-${row.no}-${index}`}>
              <span>{row.no}</span>
              <input
                value={row.date || ""}
                onChange={(e) => updateRow(row, "date", e.target.value)}
              />
              <input
                value={row.time || ""}
                onChange={(e) => updateRow(row, "time", e.target.value)}
              />
              <input
                value={row.title || ""}
                onChange={(e) => updateRow(row, "title", e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LiveImportChecks({ summary, ignored }) {
  const expected = { 寒假: 10, 春季: 16, 暑期: 10, 秋季: 16 };
  const issues = summary.cells.filter(
    (c) => expected[c.quarter] && c.lessons !== expected[c.quarter],
  );
  return (
    <div className={issues.length ? "live-check warning" : "live-check ok"}>
      <strong>
        {summary.grades.length} 年级 × {summary.subjects.length} 科目 ·{" "}
        {summary.cells.length} 个季度单元
      </strong>
      <span>
        {issues.length
          ? `${issues.length} 处课时异常：${issues
              .slice(0, 3)
              .map(
                (x) =>
                  `${x.grade}${x.subject}${x.quarter} ${x.lessons}/${expected[x.quarter]}节`,
              )
              .join("；")}`
          : "季度课时数量全部符合规则"}
        {ignored ? `；已排除 ${ignored} 行无季度/无大纲数据` : ""}
      </span>
    </div>
  );
}

function VideoAssociationSummary({ draft }) {
  const summary = draft.videoImportSummary;
  const annualOutlineQuarters = VIDEO_QUARTERS;
  const activeQuarters = draft.coverageQuarters.filter((quarter) =>
    VIDEO_QUARTERS.includes(quarter),
  );
  const outlineQuarters = annualOutlineQuarters.filter((quarter) =>
    activeQuarters.includes(quarter),
  );
  const subjects = Object.keys(draft.videoLibrary?.[draft.grade] || {});
  const libraryGrades = Object.keys(draft.videoLibrary || {});
  const librarySubjects = [
    ...new Set(
      Object.values(draft.videoLibrary || {}).flatMap((grade) =>
        Object.keys(grade || {}),
      ),
    ),
  ];
  const displaySummary = summary || {
    grades: libraryGrades,
    subjects: librarySubjects,
  };
  const [outlineSubject, setOutlineSubject] = useState(subjects[0] || "语文");
  const [outlineQuarter, setOutlineQuarter] = useState(
    outlineQuarters[0] || "",
  );
  const annualVideoTasks = buildMaterialTasks({
    ...draft,
    coverageQuarters: annualOutlineQuarters,
  }).filter((task) => task.type === "知识视频");
  const subjectTracks = annualVideoTasks
    .filter((task) => task.subject === outlineSubject)
    .map((task) => task.track);
  const [outlineTrack, setOutlineTrack] = useState("通用版");
  useEffect(() => {
    if (subjects.length && !subjects.includes(outlineSubject)) {
      setOutlineSubject(subjects[0]);
    }
  }, [draft.grade, subjects.join("|")]);
  useEffect(() => {
    if (!outlineQuarters.includes(outlineQuarter))
      setOutlineQuarter(outlineQuarters[0] || "");
  }, [outlineQuarters.join("|")]);
  useEffect(() => {
    if (subjectTracks.length && !subjectTracks.includes(outlineTrack)) {
      setOutlineTrack(subjectTracks[0]);
    }
  }, [outlineSubject, subjectTracks.join("|")]);
  const outlineRows = outlineQuarter
    ? getVideoRows(
        { ...draft, coverageQuarters: [outlineQuarter] },
        outlineSubject,
        subjectTracks.includes(outlineTrack) ? outlineTrack : subjectTracks[0],
      )
    : [];
  const videoTasks = buildMaterialTasks(draft).filter(
    (task) => task.type === "知识视频",
  );
  const counts = videoTasks.flatMap((task) =>
    activeQuarters.map((quarter) => ({
      subject: task.subject,
      track: task.track,
      quarter,
      count: getVideoRows(
        { ...draft, coverageQuarters: [quarter] },
        task.subject,
        task.track,
      ).length,
      expected: expectedVideoLessonCount(task.subject, quarter, draft.grade),
    })),
  );
  const issues = counts.filter((item) => item.count !== item.expected);
  return (
    <div className="config-card video-association">
      <div className="config-heading">
        <div>
          <span>知识视频自动关联</span>
          <h2>课程大纲映射</h2>
        </div>
        <em>
          {activeQuarters.length
            ? formatCourseStages(draft.grade, activeQuarters)
            : "当前产品不含知识视频阶段"}
        </em>
      </div>
      {!subjects.length || !outlineQuarters.length ? (
        <div className="live-empty">
          {!subjects.length
            ? "上传知识视频全年底表后，这里会按年级、科目、课程阶段和大纲差异自动生成版本。"
            : "当前产品未选择知识视频课程阶段。"}
        </div>
      ) : (
        <>
          <div className="video-outline-browser">
            <div className="video-outline-browser-head">
              <div>
                <strong>全年知识视频大纲</strong>
                <span>选择科目、阶段和版本，查看前端课表实际映射内容</span>
              </div>
              <em>{outlineRows.length} 条视频</em>
            </div>
            <div className="video-outline-controls">
              <label>
                编辑科目
                <select
                  value={outlineSubject}
                  onChange={(event) => setOutlineSubject(event.target.value)}
                >
                  {subjects.map((subject) => (
                    <option key={subject}>{subject}</option>
                  ))}
                </select>
              </label>
              <label>
                查看阶段
                <div className="video-stage-tabs">
                  {outlineQuarters.map((quarter) => (
                    <button
                      type="button"
                      className={outlineQuarter === quarter ? "active" : ""}
                      key={quarter}
                      onClick={() => setOutlineQuarter(quarter)}
                    >
                      {formatCourseStage(draft.grade, quarter)}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                课表版本
                <div className="video-stage-tabs">
                  {subjectTracks.map((track) => (
                    <button
                      type="button"
                      className={outlineTrack === track ? "active" : ""}
                      key={track}
                      onClick={() => setOutlineTrack(track)}
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="video-outline-table">
              <div>
                <span>序号</span>
                <span>所属模块</span>
                <span>模块分值</span>
                <span>视频大纲</span>
                <span>难度星级</span>
                <span>内容属性</span>
              </div>
              {outlineRows.map((row, index) => (
                <div
                  key={`${outlineQuarter}-${outlineTrack}-${index}-${row.title}`}
                >
                  <span>{row.no ?? index + 1}</span>
                  <span>{row.module || "其他模块"}</span>
                  <span>{row.scoreShare || "—"}</span>
                  <strong>
                    {row.title}
                    {isCourseLayered(row) ? (
                      <small className="course-layer-badge">课程分层</small>
                    ) : null}
                  </strong>
                  <span className="video-stars">
                    {"★".repeat(normalizeDifficulty(row.difficulty))}
                  </span>
                  <em>{row.layer || "通用"}</em>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GiftAssociationSummary({ draft }) {
  const subjects = Object.keys(draft.gifts || {});
  const [subject, setSubject] = useState(subjects[0] || "语文");
  useEffect(() => {
    if (subjects.length && !subjects.includes(subject)) setSubject(subjects[0]);
  }, [subjects.join("|")]);
  const rows = draft.gifts?.[subject] || [];
  return (
    <div className="config-card gift-association">
      <div className="config-heading">
        <div>
          <span>赠课</span>
          <h2>课程大纲映射</h2>
        </div>
        <em>{rows.length} 课时</em>
      </div>
      {!subjects.length ? (
        <div className="live-empty">上传赠课底表后显示对应课程大纲。</div>
      ) : (
        <>
          <div className="simple-subject-control">
            <label>
              科目
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {subjects.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="gift-mapping-table">
            <div>
              <span>讲次</span>
              <strong>课程名称</strong>
            </div>
            {rows.map((row, index) => (
              <div key={`${subject}-${index}-${row.title}`}>
                <span>第{toChineseLesson(index + 1)}讲</span>
                <strong>{row.title}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkbookSlot({ type, title, description, filename, count, onChange }) {
  return (
    <article className="workbook-slot">
      <span className={`workbook-icon ${type}`}>
        <FileSpreadsheet size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        <small>{filename || "尚未上传"}</small>
      </div>
      <em>{count} 条</em>
      <label>
        <Upload size={15} />
        上传底表
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => onChange(event, type)}
        />
      </label>
    </article>
  );
}

function CourseInventory({ product }) {
  const tasks = buildMaterialTasks(product);
  return (
    <div className="config-card">
      <div className="config-heading">
        <div>
          <span>配置检查</span>
          <h2>将生成 {tasks.length} 张素材</h2>
        </div>
      </div>
      <div className="inventory-grid">
        {tasks.map((task) => (
          <div key={task.id}>
            <strong>{task.subject}</strong>
            <span>
              {task.type} · {task.track}
            </span>
            <em>{task.count} 条</em>
          </div>
        ))}
      </div>
    </div>
  );
}
function renderTaskPoster(task, product, rows, ref, options = {}) {
  if (task.type === "价格") return <PricePoster ref={ref} product={product} quoteMode={task.priceMode || (task.track === "非文综阶梯价" ? "nonWenZong" : "wenZong")} editable={options.priceEditing} onChange={options.onPriceCopyChange} />;
  if (task.type === "学法直播")
    return (
      <LivePoster
        ref={ref}
        product={product}
        subject={task.subject}
        rows={rows}
        editable={options.liveEditing}
        onChange={options.onLiveCopyChange}
      />
    );
  if (task.type === "知识视频")
    return (
      <VideoPoster
        ref={ref}
        product={product}
        subject={task.subject}
        track={task.track}
        rows={rows}
        editable={options.videoEditing}
        override={product.videoTemplateOverride || {}}
        onChange={options.onVideoCopyChange}
      />
    );
  return (
    <GiftPoster
      ref={ref}
      product={product}
      subject={task.subject}
      rows={rows}
      editable={options.giftEditing}
      override={product.giftTemplateOverride || {}}
      onChange={options.onGiftCopyChange}
    />
  );
}
function priceTotalLessons(product) {
  const hours = effectivePriceHours(product);
  return hours.knowledge + hours.live;
}
function effectivePriceHours(product) {
  const configuredKnowledge = Number(product?.priceConfig?.knowledgeHours || 0);
  const configuredLive = Number(product?.priceConfig?.liveHours || 0);
  const courseSubjects = Object.keys(
    product?.videoLibrary?.[product?.grade] || {},
  );
  const referenceSubject = courseSubjects.includes("数学")
    ? "数学"
    : courseSubjects.find((subject) => !["政治", "历史", "地理"].includes(subject));
  const knowledgeRows = referenceSubject
    ? getVideoRows(product, referenceSubject, "目标班")
    : [];
  const liveRows = referenceSubject ? getLiveRows(product, referenceSubject) : [];
  return {
    knowledge: configuredKnowledge || knowledgeRows.length,
    live: configuredLive || liveRows.length,
  };
}

const PricePoster = React.forwardRef(function PricePoster({ product, quoteMode = "nonWenZong", editable = false, onChange }, ref) {
  const price = product.priceConfig || {};
  const isWenZong = quoteMode === "wenZong";
  const effectiveHours = effectivePriceHours(product);
  const theme = product.grade === "高二" ? "theme-blue" : product.grade === "高三" ? "theme-purple" : "theme-peach";
  const cardLabel = product.stage || product.name.replace(product.grade, "") || "课程卡";
  const defaultGradeDisplayName = `${product.grade}年级`;
  const defaultProductDisplayName = product.name.startsWith(defaultGradeDisplayName)
    ? product.name.slice(defaultGradeDisplayName.length)
    : product.name.startsWith(product.grade)
      ? product.name.slice(product.grade.length)
      : product.name;
  const gradeDisplayName = price.titleGrade || defaultGradeDisplayName;
  const productDisplayName = price.titleProduct || defaultProductDisplayName;
  const titleSuffix = price.titleSuffix || "价格体系";
  const tagLabel = isWenZong ? (price.wenZongTag || "文综") : (price.tag || "非文综");
  const subjectScopeLabel = isWenZong
    ? (price.wenZongSubjectScope || "政治・历史・地理")
    : (price.subjectScope || "适用科目以产品配置为准");
  const subjectScopeField = isWenZong ? "wenZongSubjectScope" : "subjectScope";
  const wenZongCourseLabel = price.wenZongCourseLabel || "文综单科";
  const commitText = (field, currentValue, event) => {
    const value = event.currentTarget.textContent.trim();
    if (value) onChange?.({ [field]: value });
    else event.currentTarget.textContent = currentValue;
  };
  const finishOnEnter = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  };
  const rows = getPriceTierCounts(quoteMode).map((count) => {
    const unit = count === 1 ? price.tier1 : count === 2 ? price.tier2 : price.tier3;
    const official = Number(price.officialUnitPrice || 0) * count;
    const payment = Number(unit || 0) * count;
    return { count, unit, official, coupon: official - payment, payment };
  });
  return (
    <article ref={ref} className={`figma-poster price-poster ${theme}`}>
      <div className="brand-plate">
        <img src={assetUrl("price-assets/brand-logo.png")} alt="网易有道领世" />
      </div>
      <div className="hero-card autumn-card-icon" aria-hidden="true">
        <div className="glass-card back-card" />
        <div className="glass-card front-card"><span className={`card-title ${cardLabel.length >= 5 ? "is-long" : cardLabel.length === 4 ? "is-medium" : "is-short"}`}>{cardLabel}</span></div>
      </div>
      <div className={`tag-ribbon ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText(isWenZong ? "wenZongTag" : "tag", tagLabel, event)}>{tagLabel}</div>
      <header className="poster-title">
        <h2>
          <span className={`poster-grade-name ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText("titleGrade", gradeDisplayName, event)}>{gradeDisplayName}</span>
          <span className={`poster-product-name ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText("titleProduct", productDisplayName, event)}>{productDisplayName}</span>
          <br />
          <span className={`poster-title-suffix ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText("titleSuffix", titleSuffix, event)}>{titleSuffix}</span>
        </h2>
        <p className={`poster-subtitle ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText(subjectScopeField, subjectScopeLabel, event)}>{subjectScopeLabel}</p>
      </header>
      <section className="table-card">
        {isWenZong ? <div className="price-table wenzong-price-table">
          <div className="wenzong-row wenzong-header"><div>课程</div><div>官网原价</div><div>优惠券</div><div>一口价</div></div>
          <div className="wenzong-row wenzong-body"><div className={`wenzong-course ${editable ? "price-editable" : ""}`} contentEditable={editable} suppressContentEditableWarning onKeyDown={finishOnEnter} onBlur={(event) => commitText("wenZongCourseLabel", wenZongCourseLabel, event)}>{wenZongCourseLabel}</div><div className="price-cell official-cell">¥{Number(price.wenZongMode === "same" ? price.officialUnitPrice : price.wenZongOfficialUnitPrice || 0).toLocaleString()}</div><div className="price-cell">¥{Math.max(0, Number(price.wenZongMode === "same" ? price.officialUnitPrice - price.tier1 : (price.wenZongOfficialUnitPrice || 0) - (price.wenZongDealUnitPrice || 0))).toLocaleString()}</div><div className="wenzong-deal">¥{Number(price.wenZongMode === "same" ? price.tier1 : price.wenZongDealUnitPrice || 0).toLocaleString()}<span className="unit">/科</span></div></div>
        </div> : <div className="price-table">
          <div className="table-row header"><div>科目</div><div>官网价格</div><div>优惠券</div><div>优惠后每科</div><div>支付价格</div></div>
        {rows.map((row) => (
          <div key={row.count} className={`table-row ${row.count === 3 ? "highlight" : ""}`}>
            <div className="subject-cell">{["一","两","三","四","五","六"][row.count - 1]}科</div>
            <div className="price-cell official-cell">¥{row.official.toLocaleString()}</div>
            <div className="price-cell coupon-cell">¥{row.coupon.toLocaleString()}</div>
            <div className="price-cell unit-price-cell">¥{Number(row.unit || 0).toLocaleString()}<span className="unit">/科</span></div>
            <div className="pay-cell">¥{row.payment.toLocaleString()}</div>
          </div>
        ))}
        </div>}
        <div className="course-band">每科课程包含</div>
        <div className="course-modules" data-count="3" style={{ "--module-count": 3 }}>
          <article className="module">
            <div className="module-visual"><img src={assetUrl("price-assets/module-knowledge.png")} alt="" /></div>
            <div className="module-label"><span className="module-chip">知识视频</span><span className="module-copy">查缺补漏</span></div>
            <div className="module-hours">{isWenZong ? (price.wenZongKnowledgeHours || `${effectiveHours.knowledge}节/科`) : `${effectiveHours.knowledge}节/科`}{(isWenZong ? price.wenZongKnowledgeGift : price.knowledgeGift) ? <span className="gift-text">{isWenZong ? price.wenZongKnowledgeGift : price.knowledgeGift}</span> : null}</div>
          </article>
          <article className="module">
            <div className="module-visual"><img src={assetUrl("price-assets/module-live.png")} alt="" /></div>
            <div className="module-label"><span className="module-chip">学法直播</span><span className="module-copy">大招提分</span></div>
            <div className="module-hours">{isWenZong ? (price.wenZongLiveHours || `${effectiveHours.live}节/科`) : `${effectiveHours.live}节/科`}{(isWenZong ? price.wenZongLiveGift : price.liveGift) ? <span className="gift-text">{isWenZong ? price.wenZongLiveGift : price.liveGift}</span> : null}</div>
          </article>
          <article className="module">
            <div className="module-visual"><img src={assetUrl("price-assets/module-service.png")} alt="" /></div>
            <div className="module-label"><span className="module-chip">辅导服务</span><span className="module-copy">伴学提升</span></div>
            <div className="module-hours">{isWenZong ? (price.wenZongServiceText || price.serviceText || "专属学习服务") : (price.serviceText || "专属学习服务")}{(isWenZong ? price.wenZongServiceGift : price.serviceGift) ? <span className="gift-text">{isWenZong ? price.wenZongServiceGift : price.serviceGift}</span> : null}<small className="service-period">{price.servicePeriod}</small></div>
          </article>
        </div>
      </section>
      <footer className="notes-row">
        <div className="note-label"><span>说</span><span>明</span></div>
        <ol>{(price.notes?.length ? price.notes : ["具体课程与价格以产品配置为准。", "报名权益以实际购买科目为准。"]).map((note, index) => <li key={index}>{note}</li>)}</ol>
        <div className="gift-box">
          <i className="gift-bow" aria-hidden="true" />
          <span>报名赠送多个礼品</span>
        </div>
      </footer>
    </article>
  );
});
const LivePoster = React.forwardRef(function LivePoster(
  { product, subject, rows, editable = false, onChange },
  ref,
) {
  const override = product.liveTemplateOverride || {};
  const page = override.pages?.[livePageKey(product, subject)] || {};
  const copy = {
    titleGrade: `${product.grade}年级`,
    titleProduct: `${product.stage}・学法精讲`,
    contentTitle: "课程内容",
    headline: "清北毕业名师直播2小时传授解题大招",
    subheadline: "同步校内进度+讲练结合",
    featureExam: "真题解读",
    featureBank: "知识题库",
    featureClass: "小班教学",
    featureNotes: "学法讲义",
    timeLabel: "上课时间",
    dateHeader: "上课日期",
    noHeader: "序号",
    courseHeader: "课程内容",
    ...override,
  };
  const field = (as, label, value, onCommit, className = "", normalizeValue) => (
    <PosterEditable
      as={as}
      className={className}
      editClassName="live-editable"
      label={label}
      editable={editable}
      allowEmpty
      value={value}
      onCommit={onCommit}
      normalizeValue={normalizeValue}
    />
  );
  const templateField = (as, key, label) =>
    field(as, label, copy[key], (value) =>
      onChange?.({ scope: "template", patch: { [key]: value } }),
    );
  const pageField = (as, key, fallback, label, className) =>
    field(as, label, page[key] ?? fallback, (value) =>
      onChange?.({ scope: "page", patch: { [key]: value } }), className,
    );
  const groups = groupLiveRows(rows, product.coverageQuarters, product.grade);
  const multi = groups.length > 1;
  const gradeTheme = gradeThemeKey(product.grade);
  const posterHeight = 661 + groups.length * 159 + rows.length * 78;
  return (
    <article
      ref={ref}
      className={`figma-poster figma-live ${gradeTheme} ${multi ? "is-multi-stage" : "is-single-stage"}`}
      style={{
        height: `${posterHeight}px`,
        "--live-header-curve": `url("${assetUrl("figma-assets/live-header-curve.svg")}")`,
      }}
    >
      <img className="figma-live-logo" src={assetUrl("figma-assets/live-logo.png")} />
      {pageField("div", "subject", subject, "当前素材科目名称", "figma-live-subject")}
      <div className="figma-live-title">
        {templateField("span", "titleGrade", "母版年级标题")}
        {templateField("h2", "titleProduct", "母版产品标题")}
      </div>
      <section className="figma-live-content">
        {templateField("h3", "contentTitle", "母版内容区标题")}
        <div className="figma-live-intro">
          <div>
            {pageField("b", "lessonLabel", `${rows.length}学时`, "当前素材课时数")}
            {templateField("strong", "headline", "母版直播说明")}
            {templateField("span", "subheadline", "母版补充说明")}
          </div>
          <div className="figma-feature-list">
            {[
              ["live-feature-exam.png", "featureExam", "母版真题解读文案"],
              ["live-feature-bank.png", "featureBank", "母版知识题库文案"],
              ["live-feature-class.png", "featureClass", "母版小班教学文案"],
              ["live-feature-notes.png", "featureNotes", "母版学法讲义文案"],
            ].map(([src, key, label]) => (
              <div key={key}>
                <img src={assetUrl(`figma-assets/${src}`)} />
                {templateField("span", key, label)}
              </div>
            ))}
          </div>
        </div>
        <div className="figma-live-stage-list">
          {groups.map((group) => {
            const stage = page.stages?.[group.quarter] || {};
            const stageField = (as, key, fallback, label) =>
              field(as, label, stage[key] ?? fallback, (value) =>
                onChange?.({ scope: "stage", quarter: group.quarter, patch: { [key]: value } }),
              );
            return (
            <section className="figma-live-stage" key={group.quarter}>
              <div className="figma-live-period">
                {stageField("strong", "label", group.label, `${group.label}阶段名称`)}
                {templateField("span", "timeLabel", `${group.quarter}上课时间表头`)}
                {stageField("b", "time", formatStageTimes(group.rows), `${group.quarter}上课时间`)}
              </div>
              <div className="figma-live-head">
                {templateField("span", "dateHeader", `${group.quarter}日期表头`)}
                {templateField("span", "noHeader", `${group.quarter}序号表头`)}
                {templateField("span", "courseHeader", `${group.quarter}课程内容表头`)}
              </div>
              <div className="figma-live-rows">
                {group.rows.map((row, index) => {
                  const rowKey = liveRowKey(row, index);
                  const rowCopy = stage.rows?.[rowKey] || {};
                  const rowField = (as, key, fallback, label) =>
                    field(as, `${group.quarter}第${index + 1}课${label}`, rowCopy[key] ?? fallback, (value) =>
                      onChange?.({
                        scope: "row", quarter: group.quarter, rowKey,
                        patch: { [key]: key === "date" ? formatCourseDate(value) : value },
                      }), "", key === "date" ? formatCourseDate : undefined,
                    );
                  return (
                  <p key={rowKey}>
                    {rowField("span", "date", formatCourseDate(row.date) || "以排课为准", "上课日期")}
                    {rowField("span", "no", index + 1, "序号")}
                    {rowField("strong", "title", row.title || row.live, "课程内容")}
                  </p>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>
      </section>
    </article>
  );
});
function groupLiveRows(rows, quarterOrder = [], grade = "") {
  const map = new Map();
  rows.forEach((row) => {
    const quarter = row.quarter || quarterOrder[0] || "课程阶段";
    if (!map.has(quarter)) map.set(quarter, []);
    map.get(quarter).push(row);
  });
  return sortCourseQuarters([...map.keys()]).map((quarter) => ({
    quarter,
    label: formatCourseStage(grade, quarter),
    rows: map.get(quarter),
  }));
}
function formatStageTimes(rows) {
  const times = [...new Set(rows.map((row) => row.time).filter(Boolean))];
  return times[0] || "以实际排课为准";
}
const VideoPoster = React.forwardRef(function VideoPoster(
  {
    product,
    subject,
    track,
    rows,
    editable = false,
    override = {},
    onChange,
  },
  ref,
) {
  const gradeTheme = gradeThemeKey(product.grade);
  const gradeAsset =
    product.grade === "高二" ? "g2" : product.grade === "高三" ? "g3" : "g1";
  const pageOverride = override.pages?.[videoPageKey(subject, track)] || {};
  const displayRows = rows.map((row, index) => ({
    ...row,
    ...(pageOverride.rows?.[index] || {}),
  }));
  const outlineGroups = groupVideoOutlineRows(displayRows);
  const defaultBenefits = [
    {
      icon: "书",
      title: "透彻全面",
      detail:
        "涵盖各学期完整的知识体系，知识点按难度分为星级，清晰梳理每个模块的知识点",
    },
    {
      icon: "靶",
      title: "七轮打磨",
      detail:
        "清北毕业主理人七轮打磨的课程，国家正规ISBN版号，多轮审核校定稿，内容质量有保障",
    },
    {
      icon: "▶",
      title: "灵活选择",
      detail: "30分钟一节，可根据孩子薄弱模块、学校进度、时间来学习",
    },
  ];
  const benefits = defaultBenefits.map((item, index) => ({
    ...item,
    ...(override.benefits?.[index] || {}),
  }));
  const copy = {
    titleGrade: override.titleGrade || product.grade,
    titleProduct:
      override.titleProduct || product.name.replace(product.grade, ""),
    knowledgeLabel: override.knowledgeLabel || "知识视频",
    headline:
      override.headline ||
      "清北毕业主理人 精心录制视频，30分钟一节课 讲透一个知识点",
    outlineTitle: override.outlineTitle || "课程大纲",
    levelBasic: override.levelBasic || "基础巩固",
    levelAbility: override.levelAbility || "能力提升",
    levelAdvanced: override.levelAdvanced || "拓展拔高",
    difficultyEasy: override.difficultyEasy || "简单",
    difficultyMedium: override.difficultyMedium || "中等",
    difficultyHard: override.difficultyHard || "困难",
    headerNo: override.headerNo || "序号",
    headerTitle: override.headerTitle || "视频大纲",
    headerDifficulty: override.headerDifficulty || "难度星级",
    layerBadge: override.layerBadge || "课程分层",
    adviceTitle: override.adviceTitle || "学习建议",
    adviceLines: override.adviceLines || [
      "·“课程分层”指的是：本节课程难度适配购买对应班型",
      "·可根据学校进度或自身薄弱点，选择对应模块进行学习。",
    ],
    footer: override.footer || "❧　系统学　练得透　考得好　❧",
  };
  const updateTemplate = (patch) =>
    onChange?.({ scope: "template", patch });
  const updatePage = (patch) => onChange?.({ scope: "page", patch });
  const editableRows = () =>
    displayRows.map((row, index) => ({
      no: String(row.no ?? index + 1),
      title: String(row.title || "未命名知识视频"),
      module: String(row.module || "其他模块"),
      scoreShare: String(row.scoreShare || ""),
      difficulty: String(row.difficulty || "1星"),
      layer: String(row.layer || "通用"),
    }));
  const updateRow = (index, field, value) => {
    const nextRows = editableRows();
    nextRows[index] = { ...nextRows[index], [field]: value };
    updatePage({ rows: nextRows });
  };
  const updateGroup = (items, field, value) => {
    const nextRows = editableRows();
    items.forEach(({ index }) => {
      nextRows[index] = { ...nextRows[index], [field]: value };
    });
    updatePage({ rows: nextRows });
  };
  return (
    <article ref={ref} className={`figma-poster figma-video ${gradeTheme}`}>
      <img
        className="figma-video-logo"
        src={
          gradeAsset === "g1"
            ? assetUrl("figma-assets/video-logo.png")
            : assetUrl(`figma-assets/video-logo-${gradeAsset}.png`)
        }
      />
      <img
        className="figma-video-bg"
        src={
          gradeAsset === "g1"
            ? assetUrl("figma-assets/video-bg.png")
            : assetUrl(`figma-assets/video-bg-${gradeAsset}.png`)
        }
      />
      <PosterEditable
        as="div"
        className="figma-video-subject"
        editable={editable}
        value={pageOverride.subject || subject}
        onCommit={(value) => updatePage({ subject: value })}
      />
      <header>
        <h2>
          <PosterEditable
            as="em"
            editable={editable}
            value={copy.titleGrade}
            onCommit={(value) => updateTemplate({ titleGrade: value })}
          />
          <PosterEditable
            editable={editable}
            value={copy.titleProduct}
            onCommit={(value) => updateTemplate({ titleProduct: value })}
          />
        </h2>
        <strong>
          <PosterEditable
            editable={editable}
            value={pageOverride.track || track}
            onCommit={(value) => updatePage({ track: value })}
          />
          ｜
          <PosterEditable
            editable={editable}
            value={copy.knowledgeLabel}
            onCommit={(value) => updateTemplate({ knowledgeLabel: value })}
          />
        </strong>
        <PosterEditable
          as="p"
          editable={editable}
          value={copy.headline}
          onCommit={(value) => updateTemplate({ headline: value })}
        />
      </header>
      <section className="figma-video-benefits">
        {benefits.map((benefit, index) => (
          <Benefit
            key={index}
            {...benefit}
            editable={editable}
            onChange={(patch) => {
              const nextBenefits = benefits.map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...patch } : item,
              );
              updateTemplate({ benefits: nextBenefits });
            }}
          />
        ))}
      </section>
      <section className="figma-video-outline">
        <div className="outline-top">
          <PosterEditable
            as="b"
            editable={editable}
            value={copy.outlineTitle}
            onCommit={(value) => updateTemplate({ outlineTitle: value })}
          />
          <div className="outline-legends">
            <p>
              <b><i /><PosterEditable editable={editable} value={copy.levelBasic} onCommit={(value) => updateTemplate({ levelBasic: value })} /></b>
              <b><i /><PosterEditable editable={editable} value={copy.levelAbility} onCommit={(value) => updateTemplate({ levelAbility: value })} /></b>
              <b><i /><PosterEditable editable={editable} value={copy.levelAdvanced} onCommit={(value) => updateTemplate({ levelAdvanced: value })} /></b>
            </p>
            <p>
              <b><span>★☆☆☆</span><PosterEditable editable={editable} value={copy.difficultyEasy} onCommit={(value) => updateTemplate({ difficultyEasy: value })} /></b>
              <b><span>★★☆☆</span><PosterEditable editable={editable} value={copy.difficultyMedium} onCommit={(value) => updateTemplate({ difficultyMedium: value })} /></b>
              <b><span>★★★★</span><PosterEditable editable={editable} value={copy.difficultyHard} onCommit={(value) => updateTemplate({ difficultyHard: value })} /></b>
            </p>
          </div>
        </div>
        <div className="outline-head">
          <PosterEditable editable={editable} value={copy.headerNo} onCommit={(value) => updateTemplate({ headerNo: value })} />
          <PosterEditable editable={editable} value={copy.headerTitle} onCommit={(value) => updateTemplate({ headerTitle: value })} />
          <PosterEditable editable={editable} value={copy.headerDifficulty} onCommit={(value) => updateTemplate({ headerDifficulty: value })} />
        </div>
        <div className="outline-rows">
          {outlineGroups.map((group, groupIndex) => (
            <section
              className="outline-module"
              key={`${group.module}-${groupIndex}`}
            >
              <div className="outline-module-title">
                <strong>
                  {toChineseNumeral(groupIndex + 1)}、
                  <PosterEditable
                    editable={editable}
                    value={group.module}
                    onCommit={(value) => updateGroup(group.items, "module", value)}
                  />
                </strong>
                <PosterEditable
                  as="b"
                  editable={editable}
                  value={group.scoreShare || "—"}
                  onCommit={(value) => updateGroup(group.items, "scoreShare", value === "—" ? "" : value)}
                />
              </div>
              {group.items.map(({ row, index }) => (
                <p key={row.id ?? `${row.no ?? index}-${index}`}>
                  <PosterEditable
                    editable={editable}
                    value={String(row.no ?? index + 1)}
                    onCommit={(value) => updateRow(index, "no", value)}
                  />
                  <strong>
                    <PosterEditable
                      className="video-row-title"
                      editable={editable}
                      value={row.title}
                      onCommit={(value) => updateRow(index, "title", value)}
                    />
                    {isCourseLayered(row) ? (
                      <PosterEditable
                        as="em"
                        className="course-layer-badge"
                        editable={editable}
                        value={copy.layerBadge}
                        onCommit={(value) => updateTemplate({ layerBadge: value })}
                      />
                    ) : null}
                  </strong>
                  <PosterEditable
                    editable={editable}
                    value={"★".repeat(normalizeDifficulty(row.difficulty))}
                    onCommit={(value) => updateRow(index, "difficulty", value)}
                  />
                </p>
              ))}
            </section>
          ))}
        </div>
        <div className="learning-advice">
          <b>
            <i>☰</i>
            <PosterEditable
              as="strong"
              editable={editable}
              value={copy.adviceTitle}
              onCommit={(value) => updateTemplate({ adviceTitle: value })}
            />
          </b>
          <span>
            {copy.adviceLines.map((line, index) => (
              <PosterEditable
                as="p"
                key={index}
                editable={editable}
                value={line}
                onCommit={(value) => {
                  const nextLines = [...copy.adviceLines];
                  nextLines[index] = value;
                  updateTemplate({ adviceLines: nextLines });
                }}
              />
            ))}
          </span>
        </div>
      </section>
      <PosterEditable
        as="footer"
        editable={editable}
        value={copy.footer}
        onCommit={(value) => updateTemplate({ footer: value })}
      />
    </article>
  );
});
function groupVideoOutlineRows(rows) {
  const groups = [];
  rows.forEach((row, index) => {
    const module = row.module || inferModule(row.title, index);
    const previous = groups[groups.length - 1];
    const group =
      previous?.module === module
        ? previous
        : { module, scoreShare: row.scoreShare || "", items: [] };
    if (group !== previous) groups.push(group);
    if (!group.scoreShare && row.scoreShare) group.scoreShare = row.scoreShare;
    group.items.push({ row, index });
  });
  return groups;
}
function isCourseLayered(row) {
  if (typeof row?.isLayered === "boolean") return row.isLayered;
  const layer = String(row?.layer || "").trim();
  return Boolean(layer) && layer !== "通用" && layer !== "否";
}
const GiftPoster = React.forwardRef(function GiftPoster(
  { product, subject, rows, editable = false, override = {}, onChange },
  ref,
) {
  const gradeTheme = gradeThemeKey(product.grade);
  const gradeAsset =
    product.grade === "高二" ? "g2" : product.grade === "高三" ? "g3" : "g1";
  const sourceGift = groupGiftRows(rows)[0] || {
    name: "赠课权益",
    intro: "精品课程，高效提升",
    lessonCount: 0,
    lessons: [],
  };
  const gift = {
    ...sourceGift,
    name: override.name ?? sourceGift.name,
    intro: override.intro ?? sourceGift.intro,
    lessons: Array.isArray(override.lessons)
      ? override.lessons
      : sourceGift.lessons.map((lesson) => ({ title: lesson.title })),
  };
  const displaySubject = subject;
  const commitText = (field, event) => {
    const value = event.currentTarget.textContent.trim();
    if (value) onChange?.({ [field]: value });
  };
  const lessonTotal = gift.lessons.length;
  return (
    <article
      ref={ref}
      className={`figma-poster figma-gift ${gradeTheme}`}
    >
      <div className="gift-card">
        <div className="gift-top-gradient" aria-hidden="true" />
        <img
          className="gift-logo"
          src={
            gradeAsset === "g1"
              ? assetUrl("figma-assets/gift-logo.png")
              : assetUrl(`figma-assets/gift-logo-${gradeAsset}.png`)
          }
        />
        <img
          className="gift-badge"
          src={
            gradeAsset === "g1"
              ? assetUrl("figma-assets/gift-badge.png")
              : assetUrl(`figma-assets/gift-badge-${gradeAsset}.png`)
          }
        />
        <header>
          <h2>
            <em>{product.grade}</em>
            <span
              className={editable ? "gift-editable" : ""}
              contentEditable={editable}
              suppressContentEditableWarning
              onBlur={(event) => commitText("name", event)}
              style={{
                "--gift-title-scale": Math.min(
                  1,
                  8 / Math.max(8, String(gift.name || "").length),
                ),
              }}
            >
              {gift.name}
            </span>
          </h2>
          <div>
            <b>{displaySubject}</b>
            <span>{lessonTotal}课时｜<i className={editable ? "gift-editable" : ""} contentEditable={editable} suppressContentEditableWarning onBlur={(event) => commitText("intro", event)}>{gift.intro}</i></span>
          </div>
        </header>
        <section className="gift-outline-list">
          <div className="gift-outline">
            <table>
              <thead>
                <tr>
                  <th>讲次</th>
                  <th>课程名称</th>
                </tr>
              </thead>
              <tbody>
                {gift.lessons.map((lesson, index) => (
                  <tr key={lesson.id ?? `${gift.name}-${index}`}>
                    <td>第{toChineseLesson(index + 1)}讲</td>
                    <td>{lesson.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </article>
  );
});
function groupGiftRows(rows) {
  const groups = [];
  const lookup = new Map();
  const hasExplicitGroups = rows.some((row) => row.giftName);
  rows.forEach((row, index) => {
    const name = hasExplicitGroups
      ? row.giftName || "其他赠课"
      : row.title || `赠课${index + 1}`;
    if (!lookup.has(name)) {
      const group = {
        name,
        intro: row.detail || "赠课权益按课程进度开放",
        declaredCount: Number(row.lessonCount || 0),
        lessons: [],
      };
      lookup.set(name, group);
      groups.push(group);
    }
    const group = lookup.get(name);
    group.lessons.push({ ...row, title: row.title || name });
    if (!group.declaredCount && row.lessonCount)
      group.declaredCount = Number(row.lessonCount);
  });
  return groups.map((group) => ({
    ...group,
    lessonCount: group.declaredCount || group.lessons.length,
  }));
}
function toChineseLesson(value) {
  const labels = [
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
    "十七",
    "十八",
    "十九",
    "二十",
  ];
  return labels[value - 1] || value;
}
function PosterEditable({
  as: Tag = "span",
  className = "",
  editClassName = "video-editable",
  label,
  editable = false,
  allowEmpty = false,
  value,
  onCommit,
  normalizeValue,
}) {
  const finishOnEnter = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.currentTarget.blur();
  };
  const commit = (event) => {
    const text = event.currentTarget.textContent.trim();
    const next = normalizeValue ? normalizeValue(text) : text;
    if (next || allowEmpty) {
      if (event.currentTarget.textContent !== next) event.currentTarget.textContent = next;
      if (next !== String(value ?? "")) onCommit?.(next);
    }
    else event.currentTarget.textContent = String(value ?? "");
  };
  return (
    <Tag
      className={`${className} ${editable ? editClassName : ""}`.trim()}
      role={editable && label ? "textbox" : undefined}
      aria-label={editable ? label : undefined}
      contentEditable={editable}
      suppressContentEditableWarning
      onKeyDown={finishOnEnter}
      onBlur={commit}
    >
      {value}
    </Tag>
  );
}

function Benefit({ icon, title, detail, editable = false, onChange }) {
  return (
    <div>
      <PosterEditable
        as="i"
        editable={editable}
        value={icon}
        onCommit={(value) => onChange?.({ icon: value })}
      />
      <p>
        <PosterEditable
          as="strong"
          editable={editable}
          value={title}
          onCommit={(value) => onChange?.({ title: value })}
        />
        <PosterEditable
          editable={editable}
          value={detail}
          onCommit={(value) => onChange?.({ detail: value })}
        />
      </p>
    </div>
  );
}
function gradeThemeKey(grade) {
  return grade === "高二"
    ? "grade-two"
    : grade === "高三"
      ? "grade-three"
      : "grade-one";
}
function pageTitle(page) {
  return { tasks: "选择产品并制作课程素材", courses: "配置产品与上传课程底表", "price-config": "配置产品价格与价格图片" }[
    page
  ];
}
function normalizeDifficulty(value) {
  const text = String(value ?? 1);
  const starCount = (text.match(/★/g) || []).length;
  const n = starCount || Number(text.match(/\d+/)?.[0] ?? 1);
  return Math.min(5, Math.max(1, n));
}
function countParsed(data, type) {
  if (!data) return 0;
  if (type === "video")
    return Object.values(data).reduce(
      (sum, tracks) =>
        sum +
        Object.values(tracks || {}).reduce(
          (trackSum, rows) => trackSum + (rows?.length || 0),
          0,
        ),
      0,
    );
  return Object.values(data).reduce(
    (sum, rows) => sum + (rows?.length || 0),
    0,
  );
}
async function renderPoster(element) {
  return renderPosterWith(html2canvas, element);
}
async function renderPosterWith(html2canvas, element) {
  const width =
    Number(element.dataset.exportWidth) || element.offsetWidth;
  const height =
    Number(element.dataset.exportHeight) ||
    element.offsetHeight;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    `left:${-(width + 200)}px`,
    "top:0",
    `width:${width}px`,
    `height:${height}px`,
    "z-index:2147483647",
    "pointer-events:none",
    "overflow:hidden",
    "opacity:1",
    "zoom:1",
    "transform:none",
    "background:transparent",
  ].join(";");
  const clone = element.cloneNode(true);
  clone.classList.add("is-exporting");
  // html2canvas can mis-measure CJK punctuation inside an inline/flex span and
  // paint suffixes such as “（一）” far away from the preceding course title.
  // Export the row title as one plain text run while keeping the live span for
  // master editing.
  clone.querySelectorAll(".video-row-title").forEach((title) => {
    title.replaceWith(document.createTextNode(title.textContent || ""));
  });
  clone.style.setProperty("width", `${width}px`);
  clone.style.setProperty("height", `${height}px`);
  clone.style.setProperty("min-height", "0");
  clone.style.setProperty("max-width", "none");
  clone.style.setProperty("margin", "0");
  clone.style.setProperty("zoom", "1");
  clone.style.setProperty("transform", "none");
  clone.style.setProperty("opacity", "1");
  clone.style.setProperty("box-shadow", "none");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await waitForPosterAssets(clone);
    await nextPaint();
    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      scale: 1,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      removeContainer: true,
    });
    return await canvasToBlob(canvas);
  } finally {
    host.remove();
  }
}
async function waitForPosterAssets(element) {
  if (document.fonts?.ready) await document.fonts.ready;
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }
      if (image.decode) await image.decode().catch(() => {});
    }),
  );
}
function inferModule(title, index) {
  const match = String(title || "").match(/【([^】]+)】/);
  return (
    match?.[1] ||
    ["基础模块", "核心方法", "综合应用", "拓展提升"][Math.floor(index / 10) % 4]
  );
}
function inferLayer(value) {
  const n = normalizeDifficulty(value);
  return n <= 1 ? "基础巩固" : n <= 3 ? "能力提升" : "拓展拔高";
}
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("PNG 生成失败"));
          return;
        }
        try {
          resolve(await addPngSrgbProfile(blob));
        } catch (error) {
          reject(error);
        }
      },
      "image/png",
      1,
    ),
  );
}
async function addPngSrgbProfile(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    !signature.every((value, index) => bytes[index] === value)
  )
    return blob;

  let cursor = 8;
  let insertAt = 33;
  while (cursor + 12 <= bytes.length) {
    const length = readUint32(bytes, cursor);
    const type = String.fromCharCode(...bytes.slice(cursor + 4, cursor + 8));
    if (type === "sRGB" || type === "iCCP") return blob;
    cursor += 12 + length;
    if (type === "IHDR") insertAt = cursor;
    if (type === "IDAT" || type === "IEND") break;
  }

  const type = new Uint8Array([115, 82, 71, 66]);
  const data = new Uint8Array([0]);
  const chunk = new Uint8Array(13);
  writeUint32(chunk, 0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, type.length);
  writeUint32(chunk, 9, pngCrc32(crcInput));

  const output = new Uint8Array(bytes.length + chunk.length);
  output.set(bytes.slice(0, insertAt), 0);
  output.set(chunk, insertAt);
  output.set(bytes.slice(insertAt), insertAt + chunk.length);
  return new Blob([output], { type: "image/png" });
}
function readUint32(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  );
}
function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}
function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function triggerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
function formatDate() {
  return new Date().toISOString().slice(0, 10);
}
function nextPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

createRoot(document.getElementById("root")).render(<App />);
