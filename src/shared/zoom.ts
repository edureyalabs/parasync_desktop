// src/shared/zoom.ts
// The page zoom for a window of a given width (in device-independent pixels): the whole page, the web's screens included, shrinks a little in a narrow
// window instead of being cut off, and grows a little on a very wide one.
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 1.2;

/** 1 from 1280 to 1920 wide; down to 0.8 at 720; up to 1.2 at 4480 and beyond. Rounded to steps of 0.05 so a drag does not make the page shimmer. */
export function zoomFor(width: number): number {
  const w = Number.isFinite(width) ? width : 1280;
  const zoom = w < 1280 ? MIN_ZOOM + ((w - 720) / (1280 - 720)) * (1 - MIN_ZOOM) : w > 1920 ? 1 + Math.min((w - 1920) / 2560, 1) * (MAX_ZOOM - 1) : 1;
  return Math.round(Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM) * 20) / 20;
}
