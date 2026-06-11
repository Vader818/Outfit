import {
  Check,
  CloudSun,
  Copy,
  Database,
  ExternalLink,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Settings,
  Shirt,
  Sparkles,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteGarment,
  getGarments,
  getRecommendations,
  getWeather,
  importTaobaoBatch,
  readLatestTaobaoCapture,
  recordWearLog,
  startTaobaoItemCapture,
  startTaobaoOrderCapture,
  updateGarment,
  type CaptureStartResult,
  type ImportSummary
} from "./api";
import { getTaobaoBookmarklet } from "./bookmarklet/taobaoBookmarklet";
import type { Garment, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "./shared/types";

type Tab = "import" | "wardrobe" | "recommend" | "settings";
type WearLogFeedback = { outfitId: string; message: string };

const CATEGORY_LABELS: Record<Garment["category"], string> = {
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  outerwear: "外套",
  shoes: "鞋履",
  accessory: "配饰"
};

const WARMTH_LABELS: Record<Garment["warmth"], string> = {
  light: "轻薄",
  medium: "常规",
  warm: "保暖",
  heavy: "厚重"
};

const OCCASIONS = ["casual", "smart-casual", "formal", "sport"] as const;

const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  casual: "休闲",
  "smart-casual": "商务休闲",
  formal: "正装",
  sport: "运动"
};
const TAOBAO_BOUGHT_ITEMS_URL = "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm";

export function App() {
  const [tab, setTab] = useState<Tab>("recommend");
  const [garments, setGarments] = useState<Garment[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureResult, setCaptureResult] = useState<CaptureStartResult | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [recordingOutfitId, setRecordingOutfitId] = useState<string | null>(null);
  const [wearLogFeedback, setWearLogFeedback] = useState<WearLogFeedback | null>(null);
  const [occasion, setOccasion] = useState("casual");
  const [latitude, setLatitude] = useState(() => localStorage.getItem("outfit.latitude") || "39.9042");
  const [longitude, setLongitude] = useState(() => localStorage.getItem("outfit.longitude") || "116.4074");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bookmarklet = useMemo(() => getTaobaoBookmarklet(), []);
  const pendingCount = garments.filter((item) => !item.confirmed && !item.excluded).length;
  const activeGarments = garments.filter((item) => item.owned && !item.excluded);

  useEffect(() => {
    void refreshGarments();
  }, []);

  async function refreshGarments() {
    setError("");
    setGarments(await getGarments());
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const payload = JSON.parse(importText);
      const result = await importTaobaoBatch(payload);
      setImportResult(result);
      setImportText("");
      await refreshGarments();
      setTab("wardrobe");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyBookmarklet() {
    await navigator.clipboard.writeText(bookmarklet);
  }

  async function startOrdersCapture() {
    setBusy(true);
    setError("");
    setCaptureResult(null);
    try {
      setCaptureResult(await startTaobaoOrderCapture({ maxPages: 3, loginWait: 60 }));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "启动采集失败");
    } finally {
      setBusy(false);
    }
  }

  async function startItemCapture() {
    setBusy(true);
    setError("");
    setCaptureResult(null);
    try {
      setCaptureResult(await startTaobaoItemCapture({ url: captureUrl.trim(), loginWait: 60 }));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "启动采集失败");
    } finally {
      setBusy(false);
    }
  }

  async function readLatestCapture() {
    setBusy(true);
    setError("");
    try {
      const latest = await readLatestTaobaoCapture();
      setImportResult(null);
      setImportText(latest.jsonText || JSON.stringify(latest.payload, null, 2));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "读取采集产物失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateOne(id: number, update: Partial<Garment>) {
    const updated = await updateGarment(id, update);
    setGarments((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function deleteOne(id: number) {
    await deleteGarment(id);
    setGarments((items) => items.filter((item) => item.id !== id));
    setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
  }

  async function bulkConfirm() {
    setBusy(true);
    await Promise.all(selectedIds.map((id) => updateGarment(id, { confirmed: true })));
    setSelectedIds([]);
    await refreshGarments();
    setBusy(false);
  }

  async function locate() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(4);
        const lon = position.coords.longitude.toFixed(4);
        setLatitude(lat);
        setLongitude(lon);
        localStorage.setItem("outfit.latitude", lat);
        localStorage.setItem("outfit.longitude", lon);
        setBusy(false);
      },
      () => setBusy(false)
    );
  }

  async function fetchForecast() {
    setBusy(true);
    setError("");
    try {
      const snapshot = await getWeather(Number(latitude), Number(longitude));
      setWeather(snapshot);
    } catch (weatherError) {
      setError(weatherError instanceof Error ? weatherError.message : "天气获取失败");
    } finally {
      setBusy(false);
    }
  }

  async function generateRecommendations() {
    setBusy(true);
    setError("");
    try {
      const snapshot = weather ?? (await getWeather(Number(latitude), Number(longitude)));
      setWeather(snapshot);
      setRecommendations(await getRecommendations({ weather: snapshot, occasion }));
    } catch (recommendError) {
      setError(recommendError instanceof Error ? recommendError.message : "推荐失败");
    } finally {
      setBusy(false);
    }
  }

  async function recordRecommendationWear(outfit: OutfitRecommendation) {
    setError("");
    setWearLogFeedback(null);
    setRecordingOutfitId(outfit.id);
    try {
      await recordWearLog(buildRecommendationWearLogInput(outfit, occasion, weather ?? recommendations?.weather ?? null));
      setWearLogFeedback({ outfitId: outfit.id, message: "已标记已穿" });
    } catch (wearLogError) {
      setError(wearLogError instanceof Error ? wearLogError.message : "标记已穿失败");
    } finally {
      setRecordingOutfitId(null);
    }
  }

  function saveSettings() {
    localStorage.setItem("outfit.latitude", latitude);
    localStorage.setItem("outfit.longitude", longitude);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Shirt size={28} />
          <div>
            <strong>Outfit</strong>
            <span>{activeGarments.length} 件可用</span>
          </div>
        </div>
        <nav>
          <NavButton active={tab === "recommend"} icon={<Wand2 size={18} />} label="今日推荐" onClick={() => setTab("recommend")} />
          <NavButton active={tab === "wardrobe"} icon={<Database size={18} />} label={`衣服库 ${pendingCount ? `(${pendingCount})` : ""}`} onClick={() => setTab("wardrobe")} />
          <NavButton active={tab === "import"} icon={<Upload size={18} />} label="导入" onClick={() => setTab("import")} />
          <NavButton active={tab === "settings"} icon={<Settings size={18} />} label="设置" onClick={() => setTab("settings")} />
        </nav>
      </aside>

      <main className="workspace">
        {error ? <div className="banner error">{error}</div> : null}
        {tab === "recommend" && (
          <RecommendationView
            weather={weather}
            recommendations={recommendations}
            occasion={occasion}
            latitude={latitude}
            longitude={longitude}
            busy={busy}
            recordingOutfitId={recordingOutfitId}
            wearLogFeedback={wearLogFeedback}
            onOccasion={setOccasion}
            onFetchWeather={fetchForecast}
            onGenerate={generateRecommendations}
            onRecordWearLog={recordRecommendationWear}
          />
        )}
        {tab === "wardrobe" && (
          <WardrobeView
            garments={garments}
            selectedIds={selectedIds}
            busy={busy}
            onRefresh={refreshGarments}
            onSelect={setSelectedIds}
            onUpdate={updateOne}
            onDelete={deleteOne}
            onBulkConfirm={bulkConfirm}
          />
        )}
        {tab === "import" && (
          <ImportView
            bookmarklet={bookmarklet}
            importText={importText}
            importResult={importResult}
            captureUrl={captureUrl}
            captureResult={captureResult}
            busy={busy}
            onCopyBookmarklet={copyBookmarklet}
            onImportText={setImportText}
            onImport={runImport}
            onCaptureUrl={setCaptureUrl}
            onStartOrdersCapture={startOrdersCapture}
            onStartItemCapture={startItemCapture}
            onReadLatestCapture={readLatestCapture}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            latitude={latitude}
            longitude={longitude}
            busy={busy}
            onLatitude={setLatitude}
            onLongitude={setLongitude}
            onLocate={locate}
            onSave={saveSettings}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ImportView(props: {
  bookmarklet: string;
  importText: string;
  importResult: ImportSummary | null;
  captureUrl: string;
  captureResult: CaptureStartResult | null;
  busy: boolean;
  onCopyBookmarklet: () => void;
  onImportText: (value: string) => void;
  onImport: () => void;
  onCaptureUrl: (value: string) => void;
  onStartOrdersCapture: () => void;
  onStartItemCapture: () => void;
  onReadLatestCapture: () => void;
}) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>导入淘宝订单</h1>
          <p>本地 JSON 入口，不保存淘宝账号。</p>
        </div>
        <div className="actions">
          <a className="secondary link-button" href={TAOBAO_BOUGHT_ITEMS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            已买到的宝贝
          </a>
          <button className="icon-button" title="复制书签脚本" onClick={props.onCopyBookmarklet}>
            <Copy size={18} />
          </button>
        </div>
      </header>
      <div className="import-guide">
        <span>1 安装采集书签</span>
        <span>2 打开已买到或商品详情</span>
        <span>3 粘贴 JSON 导入</span>
      </div>
      <div className="panel selenium-panel">
        <label>Selenium 采集</label>
        <div className="selenium-controls">
          <button className="secondary" disabled={props.busy} onClick={props.onStartOrdersCapture}>
            <Play size={18} />
            采集订单页
          </button>
          <input
            value={props.captureUrl}
            onChange={(event) => props.onCaptureUrl(event.target.value)}
            placeholder="https://item.taobao.com/item.htm?id=..."
          />
          <button className="primary" disabled={props.busy || !props.captureUrl.trim()} onClick={props.onStartItemCapture}>
            <Play size={18} />
            采集商品详情
          </button>
        </div>
        {props.captureResult ? (
          <div className="capture-status">
            已启动 {props.captureResult.mode === "orders" ? "订单页采集" : "商品详情采集"}，PID {props.captureResult.pid}，输出目录 {props.captureResult.outputDir}
          </div>
        ) : null}
      </div>
      <div className="grid two">
        <div className="panel">
          <label>书签脚本</label>
          <textarea className="code-box" readOnly value={props.bookmarklet} />
          <div className="bookmarklet-actions">
            <a className="bookmarklet-link" href={props.bookmarklet}>
              Outfit 淘宝采集
            </a>
            <button className="secondary" onClick={props.onCopyBookmarklet}>
              <Copy size={18} />
              复制脚本
            </button>
          </div>
        </div>
        <div className="panel">
          <label>采集 JSON</label>
          <textarea
            className="import-box"
            value={props.importText}
            onChange={(event) => props.onImportText(event.target.value)}
            placeholder='{"source":"taobao-bookmarklet","items":[]}'
          />
          <div className="import-actions">
            <button className="secondary" disabled={props.busy} onClick={props.onReadLatestCapture}>
              <Database size={18} />
              读取产物
            </button>
            <button className="primary" disabled={props.busy || !props.importText.trim()} onClick={props.onImport}>
              <Upload size={18} />
              导入
            </button>
          </div>
        </div>
      </div>
      {props.importResult ? (
        <div className="metric-strip">
          <Metric label="订单项" value={props.importResult.summary.totalItems} />
          <Metric label="唯一项" value={props.importResult.summary.uniqueItems} />
          <Metric label="退款过滤" value={props.importResult.summary.skippedRefunded} />
          <Metric label="非服饰过滤" value={props.importResult.summary.skippedNonApparel} />
          <Metric label="新衣服" value={props.importResult.summary.createdGarments} />
        </div>
      ) : null}
    </section>
  );
}

function WardrobeView(props: {
  garments: Garment[];
  selectedIds: number[];
  busy: boolean;
  onRefresh: () => void;
  onSelect: (ids: number[]) => void;
  onUpdate: (id: number, update: Partial<Garment>) => void;
  onDelete: (id: number) => void;
  onBulkConfirm: () => void;
}) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>衣服库</h1>
          <p>{props.garments.length} 件，{props.garments.filter((item) => !item.confirmed && !item.excluded).length} 件待确认。</p>
        </div>
        <div className="actions">
          <button className="secondary" title="刷新" onClick={props.onRefresh}>
            <RefreshCw size={18} />
            刷新
          </button>
          <button className="primary" disabled={!props.selectedIds.length || props.busy} onClick={props.onBulkConfirm}>
            <Check size={18} />
            批量确认
          </button>
        </div>
      </header>
      <div className="wardrobe-list">
        {props.garments.map((item) => (
          <article className={item.excluded ? "garment-row muted" : "garment-row"} key={item.id}>
            <input
              type="checkbox"
              checked={props.selectedIds.includes(item.id)}
              onChange={(event) =>
                props.onSelect(event.target.checked ? [...props.selectedIds, item.id] : props.selectedIds.filter((id) => id !== item.id))
              }
            />
            <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Shirt size={24} />}</div>
            <div className="garment-main">
              <input value={item.name} onChange={(event) => props.onUpdate(item.id, { name: event.target.value })} />
              <div className="field-grid">
                <Select value={item.category} values={Object.keys(CATEGORY_LABELS)} onChange={(value) => props.onUpdate(item.id, { category: value as Garment["category"] })} />
                <input value={item.color} onChange={(event) => props.onUpdate(item.id, { color: event.target.value })} />
                <Select value={item.warmth} values={Object.keys(WARMTH_LABELS)} onChange={(value) => props.onUpdate(item.id, { warmth: value as Garment["warmth"] })} />
                <input value={item.seasons.join(",")} onChange={(event) => props.onUpdate(item.id, { seasons: splitList(event.target.value) as Garment["seasons"] })} />
              </div>
            </div>
            <div className="row-actions">
              {item.detailUrl || item.itemUrl ? (
                <a className="icon-button" title="商品详情" href={item.detailUrl || item.itemUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                </a>
              ) : null}
              <button className={item.confirmed ? "status good" : "status"} onClick={() => props.onUpdate(item.id, { confirmed: !item.confirmed })}>
                <Check size={16} />
                {item.confirmed ? "已确认" : "确认"}
              </button>
              <button className={item.owned ? "status" : "status warn"} onClick={() => props.onUpdate(item.id, { owned: !item.owned })}>
                {item.owned ? "拥有" : "不在衣橱"}
              </button>
              <button className="icon-button" title="删除" onClick={() => props.onDelete(item.id)}>
                <X size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RecommendationView(props: {
  weather: WeatherSnapshot | null;
  recommendations: RecommendationResult | null;
  occasion: string;
  latitude: string;
  longitude: string;
  busy: boolean;
  recordingOutfitId: string | null;
  wearLogFeedback: WearLogFeedback | null;
  onOccasion: (value: string) => void;
  onFetchWeather: () => void;
  onGenerate: () => void;
  onRecordWearLog: (outfit: OutfitRecommendation) => void;
}) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>今日推荐</h1>
          <p>{props.latitude}, {props.longitude}</p>
        </div>
        <div className="actions">
          <button className="secondary" disabled={props.busy} onClick={props.onFetchWeather}>
            <CloudSun size={18} />
            天气
          </button>
          <button className="primary" disabled={props.busy} onClick={props.onGenerate}>
            <Sparkles size={18} />
            生成
          </button>
        </div>
      </header>
      <div className="toolbar">
        {OCCASIONS.map((value) => (
          <button className={props.occasion === value ? "chip active" : "chip"} key={value} onClick={() => props.onOccasion(value)}>
            {OCCASION_LABELS[value]}
          </button>
        ))}
      </div>
      {props.weather ? (
        <div className="weather-band">
          <CloudSun size={24} />
          <strong>{props.weather.summary}</strong>
          <span>{props.weather.apparentTemperature}°C 体感</span>
          <span>{props.weather.precipitationProbability}% 降雨</span>
          <span>{props.weather.windSpeed} km/h 风</span>
        </div>
      ) : null}
      <div className="outfit-grid">
        {props.recommendations?.outfits.map((outfit) => (
          <article className="outfit" key={outfit.id}>
            <div className="score">{outfit.score}</div>
            <div className="item-stack">
              {outfit.items.map((item) => (
                <div className="mini-item" key={item.id}>
                  <span>{CATEGORY_LABELS[item.category]}</span>
                  <strong>{item.name}</strong>
                </div>
              ))}
            </div>
            <ul>
              {outfit.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {outfit.alternatives.length ? <p className="alt">可替换：{outfit.alternatives.map((item) => item.name).join(" / ")}</p> : null}
            <div className="outfit-actions">
              <button className="secondary" disabled={props.recordingOutfitId === outfit.id} onClick={() => props.onRecordWearLog(outfit)}>
                <Check size={16} />
                {props.recordingOutfitId === outfit.id ? "标记中" : "标记已穿"}
              </button>
              {props.wearLogFeedback?.outfitId === outfit.id ? <span className="wear-log-feedback">{props.wearLogFeedback.message}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsView(props: {
  latitude: string;
  longitude: string;
  busy: boolean;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onLocate: () => void;
  onSave: () => void;
}) {
  return (
    <section className="view compact">
      <header className="view-header">
        <div>
          <h1>设置</h1>
          <p>SQLite: data/outfit.sqlite</p>
        </div>
      </header>
      <div className="panel settings-panel">
        <label>纬度</label>
        <input value={props.latitude} onChange={(event) => props.onLatitude(event.target.value)} />
        <label>经度</label>
        <input value={props.longitude} onChange={(event) => props.onLongitude(event.target.value)} />
        <div className="actions">
          <button className="secondary" disabled={props.busy} onClick={props.onLocate}>
            <MapPin size={18} />
            定位
          </button>
          <button className="primary" onClick={props.onSave}>
            <Save size={18} />
            保存
          </button>
        </div>
      </div>
    </section>
  );
}

function Select({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {values.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function buildRecommendationWearLogInput(outfit: OutfitRecommendation, occasion: string, weather: WeatherSnapshot | null) {
  return {
    garmentIds: outfit.items.map((item) => item.id),
    context: {
      outfitId: outfit.id,
      occasion,
      weather
    }
  };
}
