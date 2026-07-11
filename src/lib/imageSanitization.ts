export const GARMENT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_GARMENT_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_GARMENT_IMAGE_EDGE = 2048;

const WEBP_QUALITIES = [0.86, 0.76, 0.66, 0.56] as const;
const SCALE_STEPS = [1, 0.82, 0.67, 0.54] as const;

export interface GarmentImagePreparationOptions {
  maxBytes?: number;
  maxEdge?: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Browser-side image processing is only a preview and upload-size optimization.
 * It is not a security boundary: the server must still enforce byte/pixel limits,
 * decode the image itself, and re-encode it without metadata before persistence.
 */
export async function prepareGarmentImageForUpload(
  image: Blob,
  options: GarmentImagePreparationOptions = {}
): Promise<Blob> {
  const maxBytes = positiveLimit(options.maxBytes, MAX_GARMENT_IMAGE_UPLOAD_BYTES);
  const maxEdge = positiveLimit(options.maxEdge, MAX_GARMENT_IMAGE_EDGE);
  const mimeType = image.type.toLowerCase();

  if (!isGarmentImageMimeType(mimeType)) {
    throw new Error("照片必须是 JPEG、PNG 或 WebP 格式");
  }

  const originalCanBeUploaded = image.size > 0 && image.size <= maxBytes;
  if (!hasCanvasSupport()) {
    if (originalCanBeUploaded) return image;
    throw new Error("当前浏览器无法压缩这张照片，且原图超过 5 MB 上传上限");
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(image);
  } catch {
    throw new Error("无法读取这张照片，请重新选择有效的 JPEG、PNG 或 WebP 文件");
  }

  try {
    const base = fitImageDimensions(decoded.width, decoded.height, maxEdge);
    for (const scale of SCALE_STEPS) {
      const dimensions = {
        width: Math.max(1, Math.round(base.width * scale)),
        height: Math.max(1, Math.round(base.height * scale))
      };
      const canvas = drawToCanvas(decoded.source, dimensions);
      if (!canvas) {
        if (originalCanBeUploaded) return image;
        throw new Error("当前浏览器无法创建照片预处理画布");
      }

      try {
        for (const quality of WEBP_QUALITIES) {
          const encoded = await encodeCanvasAsWebp(canvas, quality);
          if (!encoded) break;
          if (encoded.type === "image/webp" && encoded.size > 0 && encoded.size <= maxBytes) {
            return encoded;
          }
        }
      } finally {
        releaseCanvas(canvas);
      }
    }

    // Some browsers expose canvas but not a WebP encoder. Keeping an already
    // uploadable original is a usability fallback; the server still sanitizes it.
    if (originalCanBeUploaded) return image;
    throw new Error("照片压缩后仍超过 5 MB，请选择尺寸更小的图片");
  } finally {
    decoded.dispose();
  }
}

export function fitImageDimensions(width: number, height: number, maxEdge = MAX_GARMENT_IMAGE_EDGE): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("图片尺寸无效");
  }
  const limit = positiveLimit(maxEdge, MAX_GARMENT_IMAGE_EDGE);
  const scale = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function isGarmentImageMimeType(value: string): value is (typeof GARMENT_IMAGE_MIME_TYPES)[number] {
  return GARMENT_IMAGE_MIME_TYPES.includes(value.toLowerCase() as (typeof GARMENT_IMAGE_MIME_TYPES)[number]);
}

// Backwards-friendly aliases for callers that describe this step as preprocessing.
export const preprocessGarmentImage = prepareGarmentImageForUpload;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

function hasCanvasSupport(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

async function decodeImage(image: Blob): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(image, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          dispose: () => bitmap.close()
        };
      }
      bitmap.close();
    } catch {
      // Fall through to the widely supported object-URL image decoder.
    }
  }
  return decodeWithImageElement(image);
}

function decodeWithImageElement(image: Blob): Promise<DecodedImage> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return Promise.reject(new Error("浏览器不支持本地图片解码"));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(image);
    const element = new Image();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      URL.revokeObjectURL(objectUrl);
    };

    element.onload = () => {
      const width = element.naturalWidth || element.width;
      const height = element.naturalHeight || element.height;
      if (width <= 0 || height <= 0) {
        release();
        reject(new Error("图片尺寸无效"));
        return;
      }
      resolve({ source: element, width, height, dispose: release });
    };
    element.onerror = () => {
      release();
      reject(new Error("图片解码失败"));
    };
    element.src = objectUrl;
  });
}

function drawToCanvas(source: CanvasImageSource, dimensions: ImageDimensions): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) {
    releaseCanvas(canvas);
    return null;
  }
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);
  return canvas;
}

function encodeCanvasAsWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  if (typeof canvas.toBlob !== "function") return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}
