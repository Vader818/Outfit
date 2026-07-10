import { Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../ui";
import { displayThumbnailUrl, garmentMeta } from "../../lib/garments";
import type { Garment } from "../../shared/types";

export function GarmentImage({
  item,
  variant = "thumbnail",
  className,
  eager = false
}: {
  item: Garment;
  variant?: "thumbnail" | "card" | "stage";
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const meta = garmentMeta(item);
  const alt = [meta.brand, item.name].filter(Boolean).join(" ") || item.name;
  const source = item.cutoutImageUrl || item.imageUrl;
  const imageUrl = displayThumbnailUrl(source);
  const cutout = Boolean(item.cutoutImageUrl && imageUrl);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <span
      className={cx("garment-image", `garment-image--${variant}`, cutout && "garment-image--cutout", className)}
      data-image-fit={cutout ? "contain" : "cover"}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="garment-image__fallback" role="img" aria-label={`${alt} 暂无本地图片`}>
          <Shirt aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
