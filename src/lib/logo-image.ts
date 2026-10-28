/**
 * Turns a picked image file into a small square-bounded data URL for upload as a business logo.
 * Keeps the original aspect ratio and transparency; the server re-validates type and size.
 */
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 512;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export const LOGO_ACCEPT = ACCEPTED.join(",");

export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Choose a PNG, JPG or WebP image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("That image is over 8 MB. Choose a smaller file.");
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file couldn't be read as an image."));
      el.src = url;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Your browser couldn't process the image.");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, width, height);

    // WebP keeps transparency and is small; browsers without WebP encoding fall back to PNG.
    let dataUrl = canvas.toDataURL("image/webp", 0.9);
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > 400_000) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (dataUrl.length > 400_000) throw new Error("That logo is too detailed. Try a simpler image.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
