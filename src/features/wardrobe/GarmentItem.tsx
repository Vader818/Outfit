import {
  Archive,
  Check,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  Scissors,
  Tags,
} from "lucide-react";
import { GarmentImage } from "../../components/garments/GarmentImage";
import { Badge, Button, cx } from "../../components/ui";
import { displayGarmentName, garmentMeta } from "../../lib/garments";
import {
  CATEGORY_LABELS,
  COLOR_LABELS,
  SEASON_LABELS,
  type BusyAction,
  WARMTH_LABELS
} from "../../shared/presentation";
import type { Garment } from "../../shared/types";
import { GarmentEditor } from "./GarmentEditor";

export interface GarmentItemProps {
  item: Garment;
  selected: boolean;
  presentation: "review" | "card";
  busyAction?: BusyAction | null;
  visionEnabled?: boolean;
  visionBusyId?: number | null;
  allowRemoteTaobaoImages?: boolean;
  onSelect: (selected: boolean) => void;
  onUpdate: (id: number, update: Partial<Garment>) => void;
  onDelete: (id: number) => void;
  onOpenThumbnailPicker?: (garment: Garment) => void;
  onCutoutGarment?: (id: number) => void;
  onAnalyzeGarmentVision?: (id: number) => void;
}

export function GarmentItem({
  item,
  selected,
  presentation,
  busyAction,
  visionEnabled,
  visionBusyId,
  allowRemoteTaobaoImages,
  onSelect,
  onUpdate,
  onDelete,
  onOpenThumbnailPicker,
  onCutoutGarment,
  onAnalyzeGarmentVision
}: GarmentItemProps) {
  const meta = garmentMeta(item);
  const detailUrl = item.detailUrl || item.itemUrl;
  const visionBusy = visionBusyId === item.id;
  const status = garmentStatus(item);

  return (
    <article
      className={cx(
        "garment-library-item",
        `garment-library-item--${presentation}`,
        selected && "garment-library-item--selected",
        item.excluded && "garment-library-item--excluded"
      )}
      title={meta.rawName || undefined}
    >
      <label className="garment-library-item__select">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`选择 ${item.name}`}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <span>选择</span>
      </label>

      <div className="garment-library-item__media">
        <GarmentImage
          item={item}
          variant={presentation === "review" ? "thumbnail" : "card"}
          allowRemoteTaobaoImages={allowRemoteTaobaoImages}
        />
      </div>

      <div className="garment-library-item__content">
        <header className="garment-library-item__header">
          <div className="garment-library-item__identity">
            {meta.brand ? <span className="garment-library-item__brand">{meta.brand}</span> : null}
            <h3>{item.name}</h3>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </header>

        <div className="garment-library-item__attributes" aria-label="衣物关键属性">
          <span>{CATEGORY_LABELS[item.category]}</span>
          <span>{COLOR_LABELS[item.color] || item.color}</span>
          <span>{WARMTH_LABELS[item.warmth]}</span>
          <span>{item.seasons.map((season) => SEASON_LABELS[season]).join(" / ")}</span>
        </div>

        <p className="garment-library-item__wear">
          {item.wearCount ? `已穿 ${item.wearCount} 次` : "暂无穿着记录"}
        </p>

        {presentation === "review" ? (
          <p className="garment-library-item__review-note">核对名称和关键属性，确认后它会进入日常衣橱。</p>
        ) : null}

        <div className="garment-library-item__primary-actions">
          <Button
            variant={item.confirmed ? "secondary" : "primary"}
            size="sm"
            aria-pressed={item.confirmed}
            onClick={() => onUpdate(item.id, { confirmed: !item.confirmed })}
          >
            <Check aria-hidden="true" size={16} />
            {item.confirmed ? "已确认" : "确认衣物"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={item.owned}
            onClick={() => onUpdate(item.id, { owned: !item.owned })}
          >
            {item.owned ? "拥有" : "不在衣橱"}
          </Button>
          <Button
            variant={item.excluded ? "danger" : "secondary"}
            size="sm"
            aria-pressed={item.excluded}
            onClick={() => onUpdate(item.id, { excluded: !item.excluded })}
          >
            {item.excluded ? "已排除推荐" : "排除推荐"}
          </Button>
        </div>

        <details className="garment-library-item__details" open={presentation === "review"}>
          <summary>
            <span>编辑与图片工具</span>
            <ChevronDown aria-hidden="true" size={17} />
          </summary>

          <GarmentEditor item={item} onUpdate={(update) => onUpdate(item.id, update)} />

          <div className="garment-library-item__tools">
            {onOpenThumbnailPicker ? (
              <Button variant="secondary" size="sm" onClick={() => onOpenThumbnailPicker(item)}>
                <ImageIcon aria-hidden="true" size={16} />
                选择缩略图
              </Button>
            ) : null}
            {detailUrl ? (
              <a
                className="ui-button ui-button--secondary ui-button--sm garment-library-item__external-link"
                href={detailUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" size={16} />
                商品详情
              </a>
            ) : null}
            {onCutoutGarment ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={visionEnabled === false || visionBusy}
                title={visionEnabled === false ? "请先在设置中启用本地视觉" : undefined}
                onClick={() => onCutoutGarment(item.id)}
              >
                <Scissors aria-hidden="true" size={16} />
                {visionBusy && busyAction === "cutout-garment" ? "处理中" : "去背景"}
              </Button>
            ) : null}
            {onAnalyzeGarmentVision ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={visionEnabled === false || visionBusy}
                title={visionEnabled === false ? "请先在设置中启用本地视觉" : undefined}
                onClick={() => onAnalyzeGarmentVision(item.id)}
              >
                <Tags aria-hidden="true" size={16} />
                {visionBusy && busyAction === "vision-tags" ? "分析中" : "分析图片"}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => confirmGarmentArchive(item, onDelete)}>
              <Archive aria-hidden="true" size={16} />
              归档
            </Button>
          </div>
        </details>
      </div>
    </article>
  );
}

function garmentStatus(item: Garment): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (item.excluded) return { label: "已排除", tone: "danger" };
  if (item.confirmed) return { label: "已确认", tone: "success" };
  return { label: "待确认", tone: "warning" };
}

function confirmGarmentArchive(item: Garment, onArchive: (id: number) => void) {
  const name = displayGarmentName(item) || item.name;
  if (globalThis.confirm(`确定归档「${name}」吗？归档后可随时恢复，不会删除来源记录或本地图片。`)) {
    onArchive(item.id);
  }
}
