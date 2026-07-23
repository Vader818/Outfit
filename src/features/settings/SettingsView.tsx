import { Cpu, Download, MapPin, Play, RefreshCw, Save } from "lucide-react";
import { Badge, Button, EmptyState, Field, Notice, PageIntro, SelectField, Surface } from "../../components/ui";
import {
  BODY_TYPE_OPTIONS,
  COLOR_DISPOSITION_OPTIONS,
  SKIN_TONE_OPTIONS,
  TEMPERATURE_OPTIONS,
  formatColorList,
  formatList,
  numberOrUndefined,
  parseColorList,
  parseList,
  visionModelDisplay,
  type BusyAction
} from "../../shared/presentation";
import type { PersonalProfile, VisionModelId, VisionModelsResponse } from "../../shared/types";

export interface SettingsViewProps {
  latitude: string;
  longitude: string;
  busy: boolean;
  busyAction?: BusyAction | null;
  profile: PersonalProfile;
  visionModels?: VisionModelsResponse | null;
  visionEnabled?: boolean;
  remoteTaobaoImagesEnabled?: boolean;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onLocate: () => void;
  onSave: () => void;
  onProfile: (profile: PersonalProfile) => void;
  onVisionEnabled?: (enabled: boolean) => void;
  onRemoteTaobaoImagesEnabled?: (enabled: boolean) => void;
  onRefreshVisionModels?: () => void;
  onDownloadVisionModel?: (id: VisionModelId) => void;
  onVerifyVisionModel?: (id: VisionModelId) => void;
}

export function SettingsView(props: SettingsViewProps) {
  const savingSettings = props.busyAction === "save-settings";

  function updateProfile(update: Partial<PersonalProfile>) {
    props.onProfile({ ...props.profile, ...update });
  }

  return (
    <section className="view settings-view">
      <PageIntro
        title="设置"
        description="位置、个人画像和视觉模型都由你控制，并保存在这台设备上。"
        meta={<Badge tone="success">本地优先</Badge>}
      />

      <form
        className="settings-form"
        aria-busy={props.busy}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave();
        }}
      >
        <Surface className="settings-section location-settings" aria-labelledby="location-settings-title">
          <div className="settings-section__heading">
            <div>
              <h2 id="location-settings-title">位置</h2>
              <p>仅用于获取当地天气，不会保存位置轨迹。</p>
            </div>
            <Button disabled={props.busy} onClick={props.onLocate}>
              <MapPin aria-hidden="true" size={18} />
              {props.busyAction === "locate" ? "定位中" : "定位"}
            </Button>
          </div>
          <div className="settings-field-grid">
            <Field
              id="settings-latitude"
              label="纬度"
              value={props.latitude}
              inputMode="decimal"
              disabled={savingSettings}
              onChange={(event) => props.onLatitude(event.target.value)}
            />
            <Field
              id="settings-longitude"
              label="经度"
              value={props.longitude}
              inputMode="decimal"
              disabled={savingSettings}
              onChange={(event) => props.onLongitude(event.target.value)}
            />
          </div>
        </Surface>

        <Surface className="settings-section profile-settings" aria-labelledby="profile-settings-title">
          <div className="settings-section__heading">
            <div>
              <h2 id="profile-settings-title">个人画像</h2>
              <p>帮助推荐更合身、更符合体感和配色偏好的搭配。</p>
            </div>
            <Badge tone="neutral">{props.profile.preferredStyles?.[0] ?? "未设置风格"}</Badge>
          </div>
          <div className="settings-field-grid settings-field-grid--profile">
            <Field
              id="profile-height"
              label="身高 cm"
              type="number"
              step="any"
              value={props.profile.heightCm ?? ""}
              disabled={savingSettings}
              onChange={(event) => updateProfile({ heightCm: numberOrUndefined(event.target.value) })}
            />
            <Field
              id="profile-weight"
              label="体重 kg"
              type="number"
              step="any"
              value={props.profile.weightKg ?? ""}
              disabled={savingSettings}
              onChange={(event) => updateProfile({ weightKg: numberOrUndefined(event.target.value) })}
            />
            <SelectField
              id="profile-body-type"
              label="体型"
              value={props.profile.bodyType ?? ""}
              options={BODY_TYPE_OPTIONS}
              disabled={savingSettings}
              onChange={(event) => updateProfile({
                bodyType: event.target.value
                  ? event.target.value as PersonalProfile["bodyType"]
                  : undefined
              })}
            />
            <SelectField
              id="profile-skin-tone"
              label="肤色"
              value={props.profile.skinTone ?? ""}
              options={SKIN_TONE_OPTIONS}
              disabled={savingSettings}
              onChange={(event) => updateProfile({
                skinTone: event.target.value
                  ? event.target.value as PersonalProfile["skinTone"]
                  : undefined
              })}
            />
            <SelectField
              id="profile-color-disposition"
              label="色彩倾向"
              value={props.profile.colorDisposition ?? ""}
              options={COLOR_DISPOSITION_OPTIONS}
              disabled={savingSettings}
              onChange={(event) => updateProfile({
                colorDisposition: event.target.value
                  ? event.target.value as PersonalProfile["colorDisposition"]
                  : undefined
              })}
            />
            <SelectField
              id="profile-temperature"
              label="温度感受"
              value={props.profile.temperatureSensitivity ?? ""}
              options={TEMPERATURE_OPTIONS}
              disabled={savingSettings}
              onChange={(event) => updateProfile({
                temperatureSensitivity: event.target.value
                  ? event.target.value as PersonalProfile["temperatureSensitivity"]
                  : undefined
              })}
            />
            <Field
              id="profile-preferred-colors"
              label="偏好颜色"
              value={formatColorList(props.profile.preferredColors)}
              placeholder="白色,蓝色,灰色"
              disabled={savingSettings}
              onChange={(event) => updateProfile({ preferredColors: parseColorList(event.target.value) })}
            />
            <Field
              id="profile-avoided-colors"
              label="避开颜色"
              value={formatColorList(props.profile.avoidedColors)}
              placeholder="黄色,棕色"
              disabled={savingSettings}
              onChange={(event) => updateProfile({ avoidedColors: parseColorList(event.target.value) })}
            />
            <Field
              id="profile-preferred-styles"
              label="偏好风格"
              value={formatList(props.profile.preferredStyles)}
              placeholder="casual,smart-casual"
              hint="使用逗号分隔多个风格。"
              disabled={savingSettings}
              onChange={(event) => updateProfile({ preferredStyles: parseList(event.target.value) })}
            />
          </div>
        </Surface>

        <Surface className="settings-section image-privacy-settings" aria-labelledby="image-privacy-title">
          <div className="settings-section__heading">
            <div>
              <h2 id="image-privacy-title">图片隐私</h2>
              <p>本地缩略图始终优先；远程淘宝商品图默认不会加载。</p>
            </div>
            <Badge tone={props.remoteTaobaoImagesEnabled ? "warning" : "success"}>
              {props.remoteTaobaoImagesEnabled ? "本会话已开启" : "远程图已关闭"}
            </Badge>
          </div>
          <label className="vision-toggle" htmlFor="remote-taobao-images-enabled">
            <input
              id="remote-taobao-images-enabled"
              type="checkbox"
              checked={props.remoteTaobaoImagesEnabled ?? false}
              onChange={(event) => props.onRemoteTaobaoImagesEnabled?.(event.target.checked)}
            />
            <span>
              <strong>本次会话加载淘宝远程图</strong>
              <small>
                开启后浏览器会直接请求淘宝 CDN，可能暴露 IP 与 User-Agent；仅本次浏览器会话有效。
              </small>
            </span>
          </label>
        </Surface>

        <Surface className="settings-section vision-settings" aria-labelledby="vision-settings-title">
          <div className="settings-section__heading">
            <div>
              <h2 id="vision-settings-title">本地视觉模型</h2>
              <p>模型只保存在本机，不会上传图片。下载和验证都需要手动操作。</p>
            </div>
            <Badge tone={props.visionEnabled === false ? "warning" : "success"}>
              {props.visionEnabled === false ? "已关闭" : "已启用"}
            </Badge>
          </div>

          <div className="vision-settings__toolbar">
            <label className="vision-toggle" htmlFor="vision-enabled">
              <input
                id="vision-enabled"
                type="checkbox"
                checked={props.visionEnabled ?? true}
                onChange={(event) => props.onVisionEnabled?.(event.target.checked)}
              />
              <span><strong>启用本地视觉</strong><small>用于去背景和衣物标签建议。</small></span>
            </label>
            {props.onRefreshVisionModels ? (
              <Button onClick={props.onRefreshVisionModels}>
                <RefreshCw aria-hidden="true" size={18} />
                刷新模型
              </Button>
            ) : null}
          </div>

          {props.visionModels ? (
            <div className="vision-models">
              <details className="technical-details model-root-details">
                <summary>模型存储位置</summary>
                <code>{props.visionModels.modelRoot}</code>
              </details>
              {props.visionModels.models.length ? props.visionModels.models.map((model) => {
                const display = visionModelDisplay(model);
                const running = model.job?.status === "running";
                const downloading = running && model.job?.action === "download";
                const verifying = running && model.job?.action === "verify";
                const tone = display.tone === "ready"
                  ? "success"
                  : display.tone === "failed"
                    ? "danger"
                    : display.tone === "running"
                      ? "info"
                      : "neutral";

                return (
                  <article className="vision-model-row" key={model.id}>
                    <div className="vision-model-row__icon" aria-hidden="true"><Cpu size={20} /></div>
                    <div className="vision-model-row__body">
                      <div className="vision-model-row__title">
                        <strong>{model.label}</strong>
                        <Badge className={`vision-state ${display.tone}`} tone={tone}>{display.label}</Badge>
                      </div>
                      <p>{display.message}</p>
                      {model.job?.status === "failed" && model.job.error ? (
                        <Notice tone="danger" role="alert">{model.job.error}</Notice>
                      ) : null}
                      <details className="technical-details">
                        <summary>模型文件</summary>
                        <dl>
                          <div><dt>路径</dt><dd>{model.path}</dd></div>
                          {model.job?.pid ? <div><dt>PID</dt><dd>{model.job.pid}</dd></div> : null}
                        </dl>
                      </details>
                    </div>
                    <div className="vision-model-actions">
                      {props.onDownloadVisionModel ? (
                        <Button
                          disabled={model.installed || running || props.busyAction === "download-vision-model"}
                          onClick={() => props.onDownloadVisionModel?.(model.id)}
                          size="sm"
                        >
                          <Download aria-hidden="true" size={16} />
                          {downloading ? "下载中" : "下载"}
                        </Button>
                      ) : null}
                      {props.onVerifyVisionModel ? (
                        <Button
                          disabled={!model.installed || running || props.busyAction === "verify-vision-model"}
                          onClick={() => props.onVerifyVisionModel?.(model.id)}
                          size="sm"
                        >
                          <Play aria-hidden="true" size={16} />
                          {verifying ? "验证中" : "验证"}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              }) : (
                <EmptyState title="还没有可用模型" description="刷新模型状态，或稍后再试。" compact />
              )}
            </div>
          ) : (
            <EmptyState title="模型状态暂不可用" description="刷新后仍不可用时，请检查本地服务。" compact />
          )}
        </Surface>

        <div className="settings-actions">
          <p>保存后，新的位置和画像会用于下一次天气与穿搭推荐。</p>
          <Button disabled={props.busy} type="submit" variant="primary">
            <Save aria-hidden="true" size={18} />
            {props.busyAction === "save-settings" ? "保存中" : "保存"}
          </Button>
        </div>
      </form>
    </section>
  );
}
