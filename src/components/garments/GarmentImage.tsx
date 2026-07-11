import { Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../ui";
import { garmentMeta, resolveGarmentImageSource } from "../../lib/garments";
import type { Garment } from "../../shared/types";

export function GarmentImage({
  item,
  variant = "thumbnail",
  className,
  eager = false,
  allowRemoteTaobaoImages = false
}: {
  item: Garment;
  variant?: "thumbnail" | "card" | "stage";
  className?: string;
  eager?: boolean;
  allowRemoteTaobaoImages?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const meta = garmentMeta(item);
  const alt = [meta.brand, item.name].filter(Boolean).join(" ") || item.name;
  const source = resolveGarmentImageSource(item, allowRemoteTaobaoImages);
  const imageUrl = source?.url ?? "";
  const cutout = source?.cutout ?? false;

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
