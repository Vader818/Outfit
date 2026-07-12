import { Archive, FolderOpen, Heart, Plus, Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, IconButton, Surface } from "../../components/ui";
import { displayThumbnailUrl } from "../../lib/garments";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type { OutfitSlot, SavedOutfit, SavedOutfitItem } from "../../shared/types";

const SOURCE_LABELS: Record<SavedOutfit["source"], string> = {
  recommendation: "推荐保存",
  manual: "手工搭配",
  replacement: "替换版本"
};

const SLOT_ORDER: Record<OutfitSlot, number> = {
  top: 0,
  bottom: 1,
  dress: 2,
  outerwear: 3,
  shoes: 4,
  accessory: 5
};

export interface SavedOutfitsPanelProps {
  outfits: SavedOutfit[];
  busy?: boolean;
  allowRemoteTaobaoImages?: boolean;
  onCreate: () => void;
  onOpen: (outfit: SavedOutfit) => void;
  onFavorite: (outfit: SavedOutfit, favorite: boolean) => void;
  onArchive: (outfit: SavedOutfit) => void;
}

export function SavedOutfitsPanel(props: SavedOutfitsPanelProps) {
  const activeOutfits = props.outfits.filter((outfit) => !outfit.archivedAt);
  const archivedOutfits = props.outfits.filter((outfit) => Boolean(outfit.archivedAt));
  const outfitById = new Map(props.outfits.map((outfit) => [outfit.id, outfit]));

  return (
    <section
      className="saved-outfits-panel"
      aria-labelledby="saved-outfits-title"
      aria-busy={props.busy || undefined}
    >
      <header className="saved-outfits-panel__header">
        <div>
          <span>可复用衣橱方案</span>
          <h2 id="saved-outfits-title">保存的搭配</h2>
          <p>重新打开、调整或归档已经保存的整套搭配。</p>
        </div>
        <Button variant="primary" disabled={props.busy} onClick={props.onCreate}>
          <Plus aria-hidden="true" size={18} />
          新建搭配
        </Button>
      </header>

      {activeOutfits.length ? (
        <div className="saved-outfits-grid">
          {activeOutfits.map((outfit) => (
            <SavedOutfitCard
              key={outfit.id}
              outfit={outfit}
              outfits={props.outfits}
              outfitById={outfitById}
              busy={props.busy}
              allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
              onOpen={props.onOpen}
              onFavorite={props.onFavorite}
              onArchive={props.onArchive}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen aria-hidden="true" />}
          title={archivedOutfits.length ? "当前没有使用中的搭配" : "还没有保存的搭配"}
          description={archivedOutfits.length
            ? "已归档内容仍可在下方回看，也可以新建一套搭配。"
            : "可以从推荐卡一键保存，也可以手工新建一套。"}
          action={(
            <Button variant="primary" disabled={props.busy} onClick={props.onCreate}>
              <Plus aria-hidden="true" size={18} />
              新建搭配
            </Button>
          )}
        />
      )}

      {archivedOutfits.length ? (
        <section className="saved-outfits-archive" aria-labelledby="saved-outfits-archive-title">
          <header className="saved-outfits-archive__header">
            <div>
              <span>历史回看</span>
              <h3 id="saved-outfits-archive-title">已归档的搭配</h3>
              <p>归档内容仍按保存时快照展示，并保留版本派生关系。</p>
            </div>
            <Badge tone="neutral">{archivedOutfits.length} 套</Badge>
          </header>
          <div className="saved-outfits-grid saved-outfits-grid--archived">
            {archivedOutfits.map((outfit) => (
              <SavedOutfitCard
                key={outfit.id}
                outfit={outfit}
                outfits={props.outfits}
                outfitById={outfitById}
                archived
                busy={props.busy}
                allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
                onOpen={props.onOpen}
                onFavorite={props.onFavorite}
                onArchive={props.onArchive}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function SavedOutfitCard({
  outfit,
  outfits,
  outfitById,
  archived = false,
  busy,
  allowRemoteTaobaoImages,
  onOpen,
  onFavorite,
  onArchive
}: {
  outfit: SavedOutfit;
  outfits: SavedOutfit[];
  outfitById: Map<number, SavedOutfit>;
  archived?: boolean;
  busy?: boolean;
  allowRemoteTaobaoImages?: boolean;
  onOpen: (outfit: SavedOutfit) => void;
  onFavorite: (outfit: SavedOutfit, favorite: boolean) => void;
  onArchive: (outfit: SavedOutfit) => void;
}) {
  const titleId = `saved-outfit-title-${outfit.id}`;
  const parent = outfit.derivedFromOutfitId
    ? outfitById.get(outfit.derivedFromOutfitId)
    : undefined;
  const derivedOutfits = outfits.filter((candidate) => candidate.derivedFromOutfitId === outfit.id);
  const sortedItems = [...outfit.items].sort(compareSavedOutfitItems);
  const favoriteLabel = outfit.favorite
    ? `取消收藏 ${outfit.name}`
    : `收藏 ${outfit.name}`;

  return (
    <Surface
      as="article"
      className={`saved-outfit-card${archived ? " saved-outfit-card--archived" : ""}`}
      aria-labelledby={titleId}
    >
      <header className="saved-outfit-card__header">
        <div>
          <div className="saved-outfit-card__badges">
            <Badge tone={outfit.source === "replacement" ? "accent" : "neutral"}>
              {SOURCE_LABELS[outfit.source]}
            </Badge>
            {archived ? <Badge tone="warning">已归档</Badge> : null}
          </div>
          <h3 id={titleId}>{outfit.name}</h3>
        </div>
        {!archived ? (
          <IconButton
            label={favoriteLabel}
            aria-label={favoriteLabel}
            aria-pressed={outfit.favorite}
            disabled={busy}
            onClick={() => onFavorite(outfit, !outfit.favorite)}
          >
            <Heart aria-hidden="true" size={18} fill={outfit.favorite ? "currentColor" : "none"} />
          </IconButton>
        ) : null}
      </header>

      {outfit.derivedFromOutfitId ? (
        <p className="saved-outfit-card__lineage">
          {parent
            ? `源自「${parent.name}」${parent.archivedAt ? "（已归档）" : ""}`
            : `源自搭配 #${outfit.derivedFromOutfitId}`}
        </p>
      ) : null}
      {derivedOutfits.length ? (
        <p className="saved-outfit-card__lineage saved-outfit-card__lineage--children">
          派生版本：{derivedOutfits.map((derived) => `「${derived.name}」${derived.archivedAt ? "（已归档）" : ""}`).join("、")}
        </p>
      ) : null}

      {sortedItems.length ? (
        <div className="saved-outfit-card__pieces" aria-label={`${outfit.name} 的保存时衣物快照`}>
          {sortedItems.map((item) => (
            <figure key={item.id} className="saved-outfit-snapshot">
              <SavedOutfitSnapshotImage
                item={item}
                allowRemoteTaobaoImages={allowRemoteTaobaoImages}
              />
              <figcaption>
                <small>{CATEGORY_LABELS[item.slot]} · {item.garmentId ? "保存时快照" : "来源已删除"}</small>
                <strong>{item.garmentSnapshot.name}</strong>
                {item.garmentSnapshot.brand ? <span>{item.garmentSnapshot.brand}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="saved-outfit-card__empty">这套搭配暂时没有衣物。</p>
      )}

      {outfit.notes ? <p className="saved-outfit-card__notes">{outfit.notes}</p> : null}

      <footer className="saved-outfit-card__actions">
        <Button
          variant="secondary"
          aria-label={`${archived ? "查看或编辑资料" : "打开编辑"} ${outfit.name}`}
          disabled={busy}
          onClick={() => onOpen(outfit)}
        >
          <FolderOpen aria-hidden="true" size={17} />
          {archived ? "查看或编辑资料" : "打开编辑"}
        </Button>
        {!archived ? (
          <Button
            variant="ghost"
            aria-label={`归档 ${outfit.name}`}
            disabled={busy}
            onClick={() => onArchive(outfit)}
          >
            <Archive aria-hidden="true" size={17} />
            归档
          </Button>
        ) : null}
      </footer>
    </Surface>
  );
}

function SavedOutfitSnapshotImage({
  item,
  allowRemoteTaobaoImages = false
}: {
  item: SavedOutfitItem;
  allowRemoteTaobaoImages?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const snapshot = item.garmentSnapshot;
  const imageUrl = displayThumbnailUrl(snapshot.imageUrl, allowRemoteTaobaoImages);
  const alt = [snapshot.brand, snapshot.name].filter(Boolean).join(" ") || snapshot.name;

  useEffect(() => setFailed(false), [imageUrl]);

  return (
    <span className="saved-outfit-snapshot__image">
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="saved-outfit-snapshot__fallback" role="img" aria-label={`${snapshot.name} 暂无本地图片`}>
          <Shirt aria-hidden="true" size={22} />
        </span>
      )}
    </span>
  );
}

function compareSavedOutfitItems(left: SavedOutfitItem, right: SavedOutfitItem): number {
  return SLOT_ORDER[left.slot] - SLOT_ORDER[right.slot] || left.position - right.position || left.id - right.id;
}
