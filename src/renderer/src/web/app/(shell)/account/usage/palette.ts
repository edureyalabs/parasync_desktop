// app/(shell)/account/usage/palette.ts
// Chart colours. The eight-hue categorical order is the validated reference palette
// (blue, orange, aqua, yellow, magenta, green, violet -- red is held back for status), run
// through the dataviz validator against the white card surface:
//   Lightness band PASS, chroma floor PASS, adjacent colour-blind separation PASS
//   (worst adjacent dE 9.1), normal-vision floor PASS (worst adjacent dE 19.6).
// Contrast vs the surface is below 3:1 for aqua, yellow and magenta, which obliges visible
// labels and a table view -- the chart ships both (legend with values, and a table twin).
// Colours are assigned by AGENT in model.ts (rankAgents), never by position.

export const SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
] as const;

/** "Other agents": the de-emphasis grey, so the tail never competes with a named agent. */
export const OTHER_COLOR = '#A7A596';

/** The running total on the cumulative chart: ink, not a series colour. */
export const TOTAL_COLOR = '#26251E';

/** One quiet hue for breakdowns whose categories are NOT agents (source), so a bar there
 *  is never mistaken for an agent's colour. Brass: the app's accent. */
export const NEUTRAL_BAR = '#A17F3A';

export const CHART = {
  surface: '#FFFFFF',
  grid: '#ECEAE0',      // hairline, one step off the surface
  axis: '#CFCBB9',      // the baseline
  tick: '#898781',      // axis labels (muted ink)
  hover: '#F5F3EA',     // the band behind the hovered bucket
} as const;

export function seriesColor(slot: number | null): string {
  return slot === null ? OTHER_COLOR : SERIES_COLORS[slot] ?? OTHER_COLOR;
}
