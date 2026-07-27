const MAX_SIZE = 256;
const JPEG_QUALITY = 0.85;

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image — try JPG or PNG"));
    };
    img.src = url;
  });
}

async function loadImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // iPhone HEIC and some Android formats fail here — fall back below.
    }
  }
  return loadViaImageElement(file);
}

function sourceDimensions(source: ImageBitmap | HTMLImageElement): {
  width: number;
  height: number;
} {
  if (source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

function drawSource(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap | HTMLImageElement,
  sx: number,
  sy: number,
  size: number
): void {
  ctx.drawImage(source as CanvasImageSource, sx, sy, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
}

export async function resizeImageToAvatar(file: File): Promise<Blob> {
  const source = await loadImageSource(file);
  const { width, height } = sourceDimensions(source);
  const size = Math.min(width, height);
  const sx = (width - size) / 2;
  const sy = (height - size) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = MAX_SIZE;
  canvas.height = MAX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  drawSource(ctx, source, sx, sy, size);
  if (source instanceof ImageBitmap) {
    source.close();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to resize image"));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
