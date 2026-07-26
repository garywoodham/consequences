import JSZip from "jszip";

/**
 * Fetch an image URL (data: or http) into bytes for zipping.
 * Panel images in this app are almost always data:image/png;base64,... URLs.
 */
async function imageUrlToBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to read image (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function extensionForUrl(url: string): string {
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) {
    return "jpg";
  }
  if (url.startsWith("data:image/webp")) return "webp";
  if (/\.jpe?g(\?|$)/i.test(url)) return "jpg";
  if (/\.webp(\?|$)/i.test(url)) return "webp";
  return "png";
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser has a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

export type ComicDownloadPanel = {
  index: number;
  imageUrl?: string;
};

/**
 * Download every panel image in a comic as a single ZIP
 * (`comic-panels.zip` with `panel-1.png`, `panel-2.png`, …).
 * Returns the number of images included.
 */
export async function downloadComicImages(
  panels: ComicDownloadPanel[],
  filename = "comic-panels.zip"
): Promise<number> {
  const withImages = panels
    .filter((p): p is ComicDownloadPanel & { imageUrl: string } =>
      Boolean(p.imageUrl)
    )
    .sort((a, b) => a.index - b.index);

  if (withImages.length === 0) {
    throw new Error("No comic images to download");
  }

  // Single image → download the file directly (no zip wrapper).
  if (withImages.length === 1) {
    const panel = withImages[0];
    const bytes = await imageUrlToBytes(panel.imageUrl);
    const ext = extensionForUrl(panel.imageUrl);
    triggerBrowserDownload(
      new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
        type: `image/${ext === "jpg" ? "jpeg" : ext}`,
      }),
      `comic-panel-${panel.index + 1}.${ext}`
    );
    return 1;
  }

  const zip = new JSZip();
  await Promise.all(
    withImages.map(async (panel) => {
      const bytes = await imageUrlToBytes(panel.imageUrl);
      const ext = extensionForUrl(panel.imageUrl);
      zip.file(`panel-${panel.index + 1}.${ext}`, bytes);
    })
  );

  const blob = await zip.generateAsync({ type: "blob" });
  triggerBrowserDownload(blob, filename);
  return withImages.length;
}
