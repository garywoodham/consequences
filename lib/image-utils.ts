const MAX_SIZE = 256;
const JPEG_QUALITY = 0.85;

export async function resizeImageToAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;

  canvas.width = MAX_SIZE;
  canvas.height = MAX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
  bitmap.close();

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
