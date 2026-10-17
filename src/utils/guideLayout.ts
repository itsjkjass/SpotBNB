export interface GuideRect { x: number; y: number; width: number; height: number }
export function guideLayout(rect: GuideRect | null, width: number, height: number, topInset: number, bottomInset: number) {
  const top = topInset + 16, bottom = height - bottomInset - 16;
  // Don't highlight a clipped/offscreen control. The explanation still remains
  // usable with large text, a short screen, or a previously scrolled page.
  const visible = rect && Object.values(rect).every(Number.isFinite) && rect.x >= 0 && rect.x + rect.width <= width && rect.width > 0 && rect.height > 0 && rect.y >= topInset && rect.y + rect.height <= bottom;
  const hole = visible ? { x: Math.max(8, rect.x - 4), y: rect.y - 4, width: Math.min(rect.width + 8, width - Math.max(8, rect.x - 4) - 8), height: rect.height + 8 } : null;
  const above = hole ? hole.y - top - 12 : 0;
  const below = hole ? bottom - hole.y - hole.height - 12 : 0;
  if (!hole || Math.max(above, below) < 200) return { hole: null, cardTop: top, cardMaxHeight: Math.max(100, bottom - top) };
  return below >= above
    ? { hole, cardTop: hole.y + hole.height + 12, cardMaxHeight: below }
    : { hole, cardTop: top, cardMaxHeight: above };
}
