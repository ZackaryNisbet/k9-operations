const CHART_PTS = 30;
const _chartFmt$ = (v) => `$${typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
const _chartFmt$k = (v) => _chartFmt$(v);

export { CHART_PTS, _chartFmt$, _chartFmt$k };
