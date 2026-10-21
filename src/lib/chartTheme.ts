// Recharts colours and tooltip style from the theme tokens (index.css), so charts follow the
// light, soft and dark themes. The tokens are RGB triplets: always wrap them in rgb(), never hsl().

export type ChartTone = 'primary' | 'success' | 'warning' | 'error';

export const chartColor = (tone: ChartTone) => `rgb(var(--${tone}))`;

export const CHART_GRID_STROKE = 'rgb(var(--border-default))';

export const CHART_CURSOR = { fill: 'rgb(var(--surface-high))' };

export const CHART_TOOLTIP_STYLE = {
  border: '1px solid rgb(var(--border-default))',
  borderRadius: 8,
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--foreground))',
};

/**
 * Margins and axis props for a time-series bar chart: in Arabic, time runs right to left and the
 * value axis sits on the right. `axisPull` pulls the value axis in to save space.
 */
export function chartDirection(rtl: boolean, axisPull = -24) {
  return {
    margin: rtl ? { top: 8, right: axisPull, bottom: 0, left: 8 } : { top: 8, right: 8, bottom: 0, left: axisPull },
    xAxis: { reversed: rtl },
    yAxis: { orientation: rtl ? ('right' as const) : ('left' as const) },
  };
}

/** Distinct series colours for categorical charts (e.g. moods). --info equals --primary in every theme. */
export const CHART_SERIES = [...(['primary', 'success', 'warning', 'error'] as const).map(chartColor), 'rgb(var(--foreground-tertiary))'];
