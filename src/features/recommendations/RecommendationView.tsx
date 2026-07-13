import { CloudSun, MapPin, RefreshCw, Sparkles, Upload } from "lucide-react";
import { Button, EmptyState, PageIntro, Surface, cx } from "../../components/ui";
import {
  OCCASIONS,
  OCCASION_LABELS,
  parseLocationCoordinates,
  type BusyAction,
  type WearLogFeedback
} from "../../shared/presentation";
import type { Garment, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "../../shared/types";
import { OutfitStage, type RecommendationFeedbackAction } from "./OutfitStage";

export type RecommendationViewProps = {
  weather: WeatherSnapshot | null;
  recommendations: RecommendationResult | null;
  availableGarmentCount?: number;
  pendingGarmentCount?: number;
  occasion: string;
  latitude: string;
  longitude: string;
  busy: boolean;
  busyAction?: BusyAction | null;
  savingOutfitId?: string | null;
  feedbackBusyCandidateId?: string | null;
  schedulingOutfitId?: string | null;
  coreGarments?: Garment[];
  recordingOutfitId: string | null;
  wearLogFeedback: WearLogFeedback | null;
  onOccasion: (value: string) => void;
  onFetchWeather: () => void;
  onGenerate: () => void;
  onRecordWearLog: (outfit: OutfitRecommendation) => void;
  onSaveOutfit?: (outfit: OutfitRecommendation) => void;
  onScheduleOutfit?: (outfit: OutfitRecommendation) => void;
  onUseGarmentAsCore?: (garment: Garment) => void;
  onReplaceGarment?: (outfit: OutfitRecommendation, garment: Garment) => void;
  onRecommendationFeedback?: (outfit: OutfitRecommendation, verdict: RecommendationFeedbackAction) => void;
  onClearGarmentConstraints?: () => void;
  onOpenImport?: () => void;
  onOpenSettings?: () => void;
  onOpenWardrobe?: () => void;
  allowRemoteTaobaoImages?: boolean;
};

function missingSlotsDescription(
  slots: RecommendationResult["missingSlots"],
  details: RecommendationResult["missingSlotDetails"] = []
): string {
  const missing = new Set(slots);
  let description: string;
  if (missing.size === 2 && missing.has("bottom") && missing.has("dress")) {
    description = "缺少已确认的下装或连衣裙；请先在衣服库确认或补齐。";
  } else if (missing.size === 2 && missing.has("top") && missing.has("dress")) {
    description = "缺少已确认的上装或连衣裙；请先在衣服库确认或补齐。";
  } else {
    description = "需要已确认的“上装＋下装”或一件连衣裙，才能组成完整核心搭配。";
  }
  const unavailableCount = details
    .filter((detail) => missing.has(detail.slot))
    .reduce((total, detail) => total + detail.unavailableCount, 0);
  return unavailableCount > 0
    ? `${description} ${unavailableCount} 件衣物因待洗、维修、借出或已装箱暂不可用。`
    : description;
}

export function RecommendationView(props: RecommendationViewProps) {
  const availableCount = props.availableGarmentCount ?? 0;
  const pendingCount = props.pendingGarmentCount ?? 0;
  const activeOccasion = OCCASION_LABELS[props.occasion as (typeof OCCASIONS)[number]] ?? props.occasion;
  const outfits = props.recommendations?.outfits ?? [];
  const hasOutfits = outfits.length > 0;
  const hasLocation = Boolean(parseLocationCoordinates(props.latitude, props.longitude));
  const missingSlots = props.recommendations?.missingSlots ?? [];
  const generating = props.busyAction === "recommend";
  const fetchingWeather = props.busyAction === "weather";
  const coreGarments = props.coreGarments ?? [];

  const emptyAction = missingSlots.length > 0 && pendingCount > 0 && props.onOpenWardrobe ? (
    <Button variant="primary" onClick={props.onOpenWardrobe}>
      <Upload aria-hidden="true" />
      去确认衣物
    </Button>
  ) : missingSlots.length > 0 && props.onOpenImport ? (
    <Button variant="primary" onClick={props.onOpenImport}>
      <Upload aria-hidden="true" />
      补充衣物
    </Button>
  ) : availableCount === 0 && pendingCount > 0 && props.onOpenWardrobe ? (
    <Button variant="primary" onClick={props.onOpenWardrobe}>
      <Upload aria-hidden="true" />
      去确认衣物
    </Button>
  ) : availableCount === 0 && props.onOpenImport ? (
    <Button variant="primary" onClick={props.onOpenImport}>
      <Upload aria-hidden="true" />
      先导入衣物
    </Button>
  ) : !hasLocation && props.onOpenSettings ? (
    <Button variant="primary" onClick={props.onOpenSettings}>
      <MapPin aria-hidden="true" />
      设置位置
    </Button>
  ) : (
    <Button variant="primary" disabled={generating || availableCount === 0} aria-busy={generating || undefined} onClick={props.onGenerate}>
      <Sparkles aria-hidden="true" />
      {generating ? "生成中" : "生成今日搭配"}
    </Button>
  );

  const emptyDescription = missingSlots.length > 0
    ? missingSlotsDescription(missingSlots, props.recommendations?.missingSlotDetails)
    : availableCount === 0 && pendingCount > 0
      ? `${pendingCount} 件衣物等待确认，确认后才能参与推荐。`
      : availableCount === 0
    ? "先把常穿衣物放进衣橱，再生成今天的搭配。"
    : !hasLocation
      ? "设置位置后，Outfit 才能结合天气判断体感。"
      : props.weather
        ? "天气和场合已经准备好，可以生成今天的搭配。"
        : "生成时会先获取天气，再结合本地衣橱给出搭配。";

  return (
    <section className="recommendation-view view-shell" aria-labelledby="recommendation-title" aria-busy={props.busy || undefined}>
      <PageIntro
        className="recommendation-intro"
        title={<span id="recommendation-title">今日推荐</span>}
        description="按天气、场合和本地衣橱生成今日搭配。"
        meta={(
          <>
            <span>可用衣物 {availableCount} 件</span>
            {pendingCount > 0 ? <span>待确认 {pendingCount} 件</span> : null}
            <span>当前场合 {activeOccasion}</span>
            <span>{props.weather ? `天气 ${props.weather.summary}` : "天气待获取"}</span>
          </>
        )}
      />

      <div className="recommendation-layout grid grid-cols-1 gap-6 lg:grid-cols-[minmax(18rem,38fr)_minmax(0,62fr)]">
        <aside className="recommendation-controls self-start lg:sticky lg:top-6" aria-labelledby="decision-context-title">
          <Surface className="decision-panel flex flex-col gap-6">
            <div className="decision-panel__heading">
              <h2 id="decision-context-title">今天的条件</h2>
              <p>先选场合，天气会参与体感和单品判断。</p>
            </div>

            {coreGarments.length ? (
              <div className="recommendation-constraints" role="status">
                <div>
                  <strong>已锁定核心单品</strong>
                  <span>{coreGarments.map((garment) => garment.name).join("、")}</span>
                </div>
                {props.onClearGarmentConstraints ? (
                  <Button variant="ghost" size="sm" onClick={props.onClearGarmentConstraints}>
                    清除核心单品
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className={cx("weather-context", props.weather && "weather-context--ready")}>
              <div className="weather-context__lead">
                <CloudSun aria-hidden="true" />
                <div>
                  <span>天气</span>
                  <strong>{props.weather?.summary ?? "尚未获取"}</strong>
                </div>
              </div>
              {props.weather ? (
                <dl className="weather-context__facts">
                  <div><dt>体感</dt><dd>{props.weather.apparentTemperature}°C</dd></div>
                  <div><dt>降雨</dt><dd>{props.weather.precipitationProbability}%</dd></div>
                  <div><dt>风速</dt><dd>{props.weather.windSpeed} km/h</dd></div>
                </dl>
              ) : (
                <p>生成搭配时会自动获取当前位置的天气。</p>
              )}
            </div>

            <fieldset className="occasion-picker">
              <legend>场合</legend>
              <div className="occasion-picker__options" aria-label="场合">
                {OCCASIONS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={props.occasion === value ? "primary" : "ghost"}
                    aria-pressed={props.occasion === value}
                    onClick={() => props.onOccasion(value)}
                  >
                    {OCCASION_LABELS[value]}
                  </Button>
                ))}
              </div>
            </fieldset>

            {hasOutfits ? (
              <div className="decision-panel__actions flex flex-wrap gap-2">
                <Button variant="ghost" disabled={fetchingWeather} aria-busy={fetchingWeather || undefined} onClick={props.onFetchWeather}>
                  <RefreshCw aria-hidden="true" />
                  {fetchingWeather ? "更新中" : "更新天气"}
                </Button>
                <Button variant="primary" disabled={generating} aria-busy={generating || undefined} onClick={props.onGenerate}>
                  <Sparkles aria-hidden="true" />
                  {generating ? "生成中" : "重新生成"}
                </Button>
              </div>
            ) : null}
          </Surface>
        </aside>

        <div className="recommendation-stage min-w-0" aria-live="polite">
          {hasOutfits ? (
            <div className="recommendation-results flex min-w-0 flex-col gap-5">
              <OutfitStage
                featured
                outfit={outfits[0]}
                recordingOutfitId={props.recordingOutfitId}
                savingOutfitId={props.savingOutfitId}
                feedbackBusyCandidateId={props.feedbackBusyCandidateId}
                schedulingOutfitId={props.schedulingOutfitId}
                wearLogFeedback={props.wearLogFeedback}
                onRecordWearLog={props.onRecordWearLog}
                onSaveOutfit={props.onSaveOutfit}
                onScheduleOutfit={props.onScheduleOutfit}
                onUseGarmentAsCore={props.onUseGarmentAsCore}
                onReplaceGarment={props.onReplaceGarment}
                onRecommendationFeedback={props.onRecommendationFeedback}
                allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
              />
              {outfits.length > 1 ? (
                <section className="recommendation-alternatives" aria-labelledby="alternative-outfits-title">
                  <h2 id="alternative-outfits-title">其他可选搭配</h2>
                  <div className="recommendation-alternatives__grid grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {outfits.slice(1).map((outfit) => (
                      <OutfitStage
                        key={outfit.id}
                        outfit={outfit}
                        recordingOutfitId={props.recordingOutfitId}
                        savingOutfitId={props.savingOutfitId}
                        feedbackBusyCandidateId={props.feedbackBusyCandidateId}
                        schedulingOutfitId={props.schedulingOutfitId}
                        wearLogFeedback={props.wearLogFeedback}
                        onRecordWearLog={props.onRecordWearLog}
                        onSaveOutfit={props.onSaveOutfit}
                        onScheduleOutfit={props.onScheduleOutfit}
                        onUseGarmentAsCore={props.onUseGarmentAsCore}
                        onReplaceGarment={props.onReplaceGarment}
                        onRecommendationFeedback={props.onRecommendationFeedback}
                        allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <Surface className="recommendation-empty-stage">
              <EmptyState
                icon={<Sparkles aria-hidden="true" />}
                title="还没有推荐"
                description={emptyDescription}
                action={emptyAction}
              />
            </Surface>
          )}
        </div>
      </div>
    </section>
  );
}
