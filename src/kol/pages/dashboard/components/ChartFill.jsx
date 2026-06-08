import React, { useState, useEffect, useRef } from "react";
import InteractiveLineChart from "../../../../shared/InteractiveLineChart";

/* ═══════════════════════════════════════════════════════════════════════════
   Chart container — measures height, renders InteractiveLineChart
   ═══════════════════════════════════════════════════════════════════════════ */
export function ChartFill({ chartData, color, compareColor, animEpoch, id, dateLabels,
  useRawPoints, lineType, solidFill, noFill, fillColor, fillOpacity, showGuideLines, showDots, dotRadius,
  todayHighlight, priorData, showPriorLine, priorLineColor, priorFillColor, priorFillOpacity,
}) {
  const containerRef = useRef(null);
  const [containerH, setContainerH] = useState(120);
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const h = containerRef.current.clientHeight;
        if (h > 30) setContainerH(h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <InteractiveLineChart
        chartData={chartData}
        color={color}
        compareColor={compareColor}
        showCompare={false}
        height={containerH}
        id={id}
        animationEpoch={animEpoch}
        dateLabels={dateLabels}
        useRawPoints={useRawPoints}
        lineType={lineType}
        solidFill={solidFill}
        noFill={noFill}
        fillColor={fillColor}
        fillOpacity={fillOpacity}
        showGuideLines={showGuideLines}
        showDots={showDots}
        dotRadius={dotRadius}
        todayHighlight={todayHighlight}
        priorData={priorData}
        showPriorLine={showPriorLine}
        priorLineColor={priorLineColor}
        priorFillColor={priorFillColor}
        priorFillOpacity={priorFillOpacity}
      />
    </div>
  );
}
