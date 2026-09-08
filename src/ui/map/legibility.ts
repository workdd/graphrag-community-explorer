// The map fits the whole graph on open. With enough communities that puts the labels at a few
// pixels, where Hangul in particular turns into a smudge and neighbouring boxes read as one. These
// numbers keep the first view readable and make a deliberate zoom-out drop the labels cleanly
// instead of drawing mush.

/** Font size the map draws community labels at, in model units. Matches node.collapsed in the style. */
export const LABEL_FONT_PX = 12;

/** Smallest rendered label we are willing to show on open. */
export const MIN_LABEL_PX = 9;

/** Below this the label is hidden rather than drawn. Kept under MIN_LABEL_PX so the first view keeps its labels. */
export const HIDE_LABEL_BELOW_PX = 8;

/** Zoom at which a label reaches MIN_LABEL_PX. */
export const LEGIBLE_ZOOM = MIN_LABEL_PX / LABEL_FONT_PX;

/**
 * Zoom to use after fitting. Fitting wins when it is already legible, so small maps still show
 * everything; a map too dense to read is opened closer instead, and the Fit button still fits.
 */
export function zoomAfterFit(fittedZoom: number, maxZoom: number): number {
  if (!Number.isFinite(fittedZoom) || fittedZoom <= 0) return Math.min(LEGIBLE_ZOOM, maxZoom);
  return Math.min(Math.max(fittedZoom, LEGIBLE_ZOOM), maxZoom);
}

/** Whether a label is drawn at this zoom, matching the style's min-zoomed-font-size. */
export const labelVisible = (zoom: number): boolean => zoom * LABEL_FONT_PX >= HIDE_LABEL_BELOW_PX;
