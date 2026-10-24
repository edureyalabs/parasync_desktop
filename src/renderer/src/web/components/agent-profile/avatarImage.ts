// components/agent-profile/avatarImage.ts
/**
 * Centre-crops an image to a square and re-encodes it as WebP, so every avatar is small and the same shape.
 *
 * Transparent areas (typical for logos) are flattened onto a solid backdrop, because a transparent avatar shows whatever
 * is behind it and can vanish at header size. The backdrop is chosen against the picture: light for a dark logo, dark
 * for a light one. A fully opaque photo is left exactly as it is.
 */
const DARK_BACKDROP = '#26251E';
const LIGHT_BACKDROP = '#F7F6F2';

/** Picks a backdrop that contrasts with the visible pixels, or null when the image has no transparency at all. */
function backdropFor(ctx: CanvasRenderingContext2D, size: number): string | null {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;   // canvas read blocked: keep the picture as drawn
  }
  let transparent = 0;
  let luminanceSum = 0;
  let visible = 0;
  for (let i = 0; i < data.length; i += 16) {   // every 4th pixel is plenty for an average
    const a = data[i + 3];
    if (a < 250) transparent++;
    if (a > 40) {
      luminanceSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      visible++;
    }
  }
  const samples = data.length / 16;
  if (transparent / samples < 0.02) return null;   // effectively opaque
  const mean = visible > 0 ? luminanceSum / visible : 0;
  return mean > 140 ? DARK_BACKDROP : LIGHT_BACKDROP;
}

export async function resizeImageToWebp(file: File, maxDim = 512, quality = 0.88): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, maxDim, maxDim);

  const backdrop = backdropFor(ctx, maxDim);
  if (backdrop) {
    // Paint the backdrop behind what is already drawn, so the picture's own pixels are untouched.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, maxDim, maxDim);
    ctx.globalCompositeOperation = 'source-over';
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
  });
}
