import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "../constants/colors";

function DataTable({ columns, rows, pageSize = 50, onRowClick }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(0);
  const [hoveredRowIdx, setHoveredRowIdx] = useState(null);

  // Reset pagination when search/filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [search, filters]);

  // Filter and sort data
  const processedRows = useMemo(() => {
    let filtered = rows.filter(row => {
      // Global search across all columns
      if (search) {
        const searchLower = search.toLowerCase();
        const matches = columns.some(col => {
          const value = col.render ? col.render(row) : row[col.key];
          const strValue = String(value).toLowerCase();
          return strValue.includes(searchLower);
        });
        if (!matches) return false;
      }

      // Apply column filters
      for (const [key, filterValue] of Object.entries(filters)) {
        if (filterValue && row[key] !== filterValue) {
          return false;
        }
      }
      return true;
    });

    // Sort
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      const isAsc = sortDir === 'asc';
      filtered.sort((a, b) => {
        const aVal = col.raw ? col.raw(a) : a[sortKey];
        const bVal = col.raw ? col.raw(b) : b[sortKey];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return isAsc ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal || '').toLowerCase();
        const bStr = String(bVal || '').toLowerCase();
        return isAsc ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return filtered;
  }, [rows, search, filters, sortKey, sortDir, columns]);

  const totalCount = rows.length;
  const filteredCount = processedRows.length;
  const pageStart = currentPage * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filteredCount);
  const pageRows = processedRows.slice(pageStart, pageEnd);
  const totalPages = Math.ceil(filteredCount / pageSize);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === '' ? undefined : value
    }));
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", padding: '20px 0' }}>
      {/* Search Bar */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1.5px solid #ccc`,
            fontSize: '13px',
            fontFamily: "'Outfit', sans-serif"
          }}
        />
      </div>

      {/* Column Filters */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {columns.map(col => col.filterOptions ? (
          <select
            key={col.key}
            value={filters[col.key] || ''}
            onChange={e => handleFilterChange(col.key, e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              border: `1px solid #ddd`,
              fontSize: '12px',
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer'
            }}
          >
            <option value="">All {col.label}</option>
            {col.filterOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : null)}
      </div>

      {/* Row Count */}
      <div style={{ marginBottom: '12px', fontSize: '12px', color: C.textMut }}>
        {filteredCount === totalCount
          ? `${filteredCount} records`
          : `${filteredCount} of ${totalCount} records`
        }
      </div>

      {/* Table */}
      {filteredCount === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: C.textMut,
          fontSize: '13px'
        }}>
          No records found
        </div>
      ) : (
        <>
          <div style={{
            overflowX: 'auto',
            borderRadius: '14px',
            border: `1.5px solid ${C.border}`
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: C.surface,
              fontSize: '12px',
              fontFamily: "'Outfit', sans-serif"
            }}>
              <thead>
                <tr style={{
                  backgroundColor: C.bg,
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable !== false && handleSort(col.key)}
                      style={{
                        padding: '12px 16px',
                        textAlign: col.align || 'left',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: C.text,
                        cursor: col.sortable !== false ? 'pointer' : 'default',
                        userSelect: 'none',
                        maxWidth: col.maxWidth,
                        whiteSpace: col.nowrap !== false ? 'nowrap' : 'normal',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        borderBottom: `1.5px solid ${C.border}`
                      }}
                    >
                      {col.label}
                      {col.sortable !== false && sortKey === col.key && (
                        <span style={{ marginLeft: '6px' }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr
                    key={idx}
                    onClick={() => onRowClick && onRowClick(row)}
                    onMouseEnter={() => setHoveredRowIdx(idx)}
                    onMouseLeave={() => setHoveredRowIdx(null)}
                    style={{
                      backgroundColor: hoveredRowIdx === idx ? C.priLt : 'transparent',
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background-color 0.15s',
                      borderBottom: `1px solid ${C.borderLight}`
                    }}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        style={{
                          padding: '12px 16px',
                          textAlign: col.align || 'left',
                          whiteSpace: col.nowrap !== false ? 'nowrap' : 'normal',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: col.maxWidth,
                          color: C.text
                        }}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            marginTop: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: C.text
          }}>
            <span>
              Showing {filteredCount > 0 ? pageStart + 1 : 0}-{pageEnd} of {filteredCount}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  backgroundColor: C.surface,
                  cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 0 ? 0.5 : 1,
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '12px'
                }}
              >
                Prev
              </button>
              <span style={{ padding: '6px 12px' }}>
                Page {totalPages > 0 ? currentPage + 1 : 0} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  backgroundColor: C.surface,
                  cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages - 1 ? 0.5 : 1,
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '12px'
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * KPICard Component
 * Displays a key performance indicator with optional trend
 */
function KPICard({ label, value, prefix, suffix, trend, trendLabel, color }) {
  const displayColor = color || C.pri;
  const trendIsPositive = trend >= 0;

  return (
    <div style={{
      padding: '24px 20px',
      borderRadius: '16px',
      border: `1.5px solid ${C.border}`,
      backgroundColor: C.surface,
      fontFamily: "'Outfit', sans-serif"
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: C.textSec,
        marginBottom: '12px'
      }}>
        {label}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        marginBottom: trend ? '12px' : 0
      }}>
        {prefix && (
          <span style={{ fontSize: '20px', color: C.textSec }}>
            {prefix}
          </span>
        )}
        <div style={{
          fontSize: '32px',
          fontWeight: 800,
          color: displayColor
        }}>
          {value}
        </div>
        {suffix && (
          <span style={{ fontSize: '16px', color: C.textSec }}>
            {suffix}
          </span>
        )}
      </div>

      {trend !== undefined && (
        <div style={{
          fontSize: '13px',
          color: trendIsPositive ? C.suc : C.dan,
          fontWeight: 600
        }}>
          <span style={{ marginRight: '4px' }}>
            {trendIsPositive ? '↑' : '↓'}
          </span>
          {Math.abs(trend)}% {trendLabel}
        </div>
      )}
    </div>
  );
}

/**
 * SVGLineChart Component
 * Renders a line chart with area fill and grid
 */
function SVGLineChart({ data, width = 600, height = 200, color = C.pri, yPrefix }) {
  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (!data || data.length === 0) {
    return <svg width={width} height={height} />;
  }

  const yValues = data.map(d => d.y);
  const yMin = 0;
  const yMax = Math.max(...yValues);
  const yRange = yMax - yMin || 1;

  const xStep = chartWidth / (data.length - 1 || 1);
  const yScale = chartHeight / yRange;

  const formatYValue = (val) => {
    return '$' + Math.round(val).toLocaleString();
  };

  // Generate path for line
  const pathPoints = data.map((d, i) => {
    const x = padding.left + i * xStep;
    const y = padding.top + chartHeight - (d.y - yMin) * yScale;
    return [x, y];
  });

  const linePath = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');

  // Area path
  const areaPath = `${linePath} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;

  // Y-axis grid lines and ticks
  const yTicks = 5;
  const gridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const ratio = i / yTicks;
    const yPos = padding.top + chartHeight - ratio * chartHeight;
    const val = yMin + ratio * yRange;
    gridLines.push({
      y: yPos,
      label: formatYValue(val)
    });
  }

  // X-axis labels (show ~7 evenly spaced)
  const xLabelCount = Math.min(7, data.length);
  const xLabelStep = Math.ceil(data.length / xLabelCount);
  const xLabels = [];
  for (let i = 0; i < data.length; i += xLabelStep) {
    const x = padding.left + i * xStep;
    xLabels.push({
      x,
      label: data[i].x,
      idx: i
    });
  }

  return (
    <svg width={width} height={height} style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Y-axis grid lines */}
      {gridLines.map((line, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={padding.left}
            y1={line.y}
            x2={width - padding.right}
            y2={line.y}
            stroke="#e5e5e5"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
          <text
            x={padding.left - 10}
            y={line.y + 4}
            textAnchor="end"
            fontSize="11"
            fill={C.textMut}
          >
            {yPrefix}{line.label}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path
        d={areaPath}
        fill={color + '15'}
        stroke="none"
      />

      {/* Line */}
      <path
        d={linePath}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {pathPoints.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={p[0]}
          cy={p[1]}
          r="3"
          fill={color}
        />
      ))}

      {/* X-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={`xlabel-${i}`}
          x={label.x}
          y={height - 8}
          textAnchor="middle"
          fontSize="11"
          fill={C.textMut}
        >
          {label.label}
        </text>
      ))}

      {/* Axes */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke={C.border}
        strokeWidth="1.5"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke={C.border}
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * SVGBarChart Component
 * Renders a vertical bar chart with grid and labels
 */
function SVGBarChart({ data, width = 600, height = 220, color = C.pri }) {
  const padding = { top: 20, right: 20, bottom: 50, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (!data || data.length === 0) {
    return <svg width={width} height={height} />;
  }

  const values = data.map(d => d.value);
  const yMax = Math.max(...values);
  const yRange = yMax || 1;
  const yScale = chartHeight / yRange;

  const barWidth = Math.max(15, Math.floor(chartWidth / data.length * 0.7));
  const barSpacing = chartWidth / data.length;

  // Y-axis grid lines and ticks
  const yTicks = 5;
  const gridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const ratio = i / yTicks;
    const yPos = padding.top + chartHeight - ratio * chartHeight;
    const val = ratio * yRange;
    gridLines.push({
      y: yPos,
      label: Math.round(val)
    });
  }

  const shouldRotateLabels = data.length > 10;

  return (
    <svg width={width} height={height} style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Y-axis grid lines */}
      {gridLines.map((line, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={padding.left}
            y1={line.y}
            x2={width - padding.right}
            y2={line.y}
            stroke="#e5e5e5"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
          <text
            x={padding.left - 10}
            y={line.y + 4}
            textAnchor="end"
            fontSize="11"
            fill={C.textMut}
          >
            {line.label}
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((item, i) => {
        const xCenter = padding.left + i * barSpacing + barSpacing / 2;
        const barHeight = (item.value / yRange) * chartHeight;
        const yStart = padding.top + chartHeight - barHeight;

        return (
          <g key={`bar-${i}`}>
            <rect
              x={xCenter - barWidth / 2}
              y={yStart}
              width={barWidth}
              height={barHeight}
              fill={item.color || color}
              rx="3"
              ry="3"
            />
            {/* Value label above bar */}
            <text
              x={xCenter}
              y={yStart - 8}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill={C.text}
            >
              {Math.round(item.value)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((item, i) => {
        const xCenter = padding.left + i * barSpacing + barSpacing / 2;

        return (
          <text
            key={`xlabel-${i}`}
            x={xCenter}
            y={height - padding.bottom + 25}
            textAnchor="middle"
            fontSize="11"
            fill={C.textMut}
            transform={shouldRotateLabels ? `rotate(-45 ${xCenter} ${height - padding.bottom + 25})` : undefined}
          >
            {item.label}
          </text>
        );
      })}

      {/* Axes */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke={C.border}
        strokeWidth="1.5"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke={C.border}
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * SVGDonutChart Component
 * Renders a donut chart with legend
 */
function SVGDonutChart({ segments, size = 200, innerRadius = 60 }) {
  const outerRadius = size / 2;

  if (!segments || segments.length === 0) {
    return <div />;
  }

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  // Calculate arc paths
  const arcs = [];
  let currentAngle = -Math.PI / 2;

  segments.forEach(segment => {
    const sliceAngle = (segment.value / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    const x1 = outerRadius + outerRadius * Math.cos(startAngle);
    const y1 = outerRadius + outerRadius * Math.sin(startAngle);
    const x2 = outerRadius + outerRadius * Math.cos(endAngle);
    const y2 = outerRadius + outerRadius * Math.sin(endAngle);

    const ix1 = outerRadius + innerRadius * Math.cos(startAngle);
    const iy1 = outerRadius + innerRadius * Math.sin(startAngle);
    const ix2 = outerRadius + innerRadius * Math.cos(endAngle);
    const iy2 = outerRadius + innerRadius * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;

    arcs.push({
      path,
      segment,
      percentage: ((segment.value / total) * 100).toFixed(1)
    });

    currentAngle = endAngle;
  });

  return (
    <div style={{
      display: 'flex',
      gap: '40px',
      alignItems: 'center',
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* Donut SVG */}
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {/* Arcs */}
        {arcs.map((arc, i) => (
          <path
            key={`arc-${i}`}
            d={arc.path}
            fill={arc.segment.color}
            stroke={C.surface}
            strokeWidth="2"
          />
        ))}

        {/* Center text */}
        <text
          x={outerRadius}
          y={outerRadius - 5}
          textAnchor="middle"
          fontSize="18"
          fontWeight="800"
          fill={C.pri}
        >
          {total}
        </text>
        <text
          x={outerRadius}
          y={outerRadius + 15}
          textAnchor="middle"
          fontSize="12"
          fill={C.textMut}
        >
          Total
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {arcs.map((arc, i) => (
          <div key={`legend-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: arc.segment.color,
                flexShrink: 0
              }}
            />
            <div style={{ fontSize: '12px', color: C.text }}>
              <div style={{ fontWeight: 600 }}>{arc.segment.label}</div>
              <div style={{ fontSize: '11px', color: C.textMut }}>
                {arc.segment.value} ({arc.percentage}%)
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SVGHeatmap Component
 * Renders a 2D heatmap with color intensity based on values
 */
function SVGHeatmap({ data, rowLabels, colLabels, width = 600, height = 300 }) {
  if (!data || data.length === 0) {
    return <svg width={width} height={height} />;
  }

  const rows = data.length;
  const cols = data[0].length;

  const padding = { top: 30, right: 20, bottom: 20, left: 120 };
  const cellWidth = (width - padding.left - padding.right) / cols;
  const cellHeight = (height - padding.top - padding.bottom) / rows;

  // Find max value for color scaling
  const allValues = data.flat();
  const maxVal = Math.max(...allValues);

  const getOpacity = (val) => {
    return Math.min(0.95, Math.max(0.1, val / (maxVal || 1)));
  };

  return (
    <svg width={width} height={height} style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Cells */}
      {data.map((row, rowIdx) => (
        row.map((val, colIdx) => {
          const x = padding.left + colIdx * cellWidth;
          const y = padding.top + rowIdx * cellHeight;
          const opacity = getOpacity(val);

          return (
            <g key={`cell-${rowIdx}-${colIdx}`}>
              <rect
                x={x}
                y={y}
                width={cellWidth}
                height={cellHeight}
                fill={C.pri}
                opacity={opacity}
                stroke={C.borderLight}
                strokeWidth="0.5"
                rx="4"
                ry="4"
              />
              <text
                x={x + cellWidth / 2}
                y={y + cellHeight / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fill={opacity > 0.6 ? C.surface : C.text}
                fontWeight="600"
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })
      ))}

      {/* Row labels */}
      {rowLabels && rowLabels.map((label, idx) => (
        <text
          key={`rowlabel-${idx}`}
          x={padding.left - 10}
          y={padding.top + idx * cellHeight + cellHeight / 2 + 4}
          textAnchor="end"
          fontSize="11"
          fill={C.text}
        >
          {label}
        </text>
      ))}

      {/* Column labels */}
      {colLabels && colLabels.map((label, idx) => (
        <text
          key={`collabel-${idx}`}
          x={padding.left + idx * cellWidth + cellWidth / 2}
          y={padding.top - 8}
          textAnchor="middle"
          fontSize="11"
          fill={C.text}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

/**
 * SVGFunnel Component
 * Renders a funnel chart showing conversion through stages
 */
function SVGFunnel({ stages, width = 400, height = 280 }) {
  if (!stages || stages.length === 0) {
    return <svg width={width} height={height} />;
  }

  const padding = { top: 20, right: 20, bottom: 20, left: 20 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const stageHeight = chartHeight / stages.length;

  const maxValue = Math.max(...stages.map(s => s.value));

  return (
    <svg width={width} height={height} style={{ fontFamily: "'Outfit', sans-serif" }}>
      {stages.map((stage, idx) => {
        const topWidth = (chartWidth * stage.value) / maxValue;
        const nextValue = stages[idx + 1] ? stages[idx + 1].value : 0;
        const bottomWidth = (chartWidth * nextValue) / maxValue;

        const x1 = padding.left + (chartWidth - topWidth) / 2;
        const x2 = padding.left + (chartWidth - bottomWidth) / 2;
        const y1 = padding.top + idx * stageHeight;
        const y2 = y1 + stageHeight;

        const opacity = 1 - (idx * 0.15);
        const stageColor = stage.color || C.pri;

        // Calculate conversion % from previous stage
        const prevValue = idx > 0 ? stages[idx - 1].value : stage.value;
        const conversionPct = ((stage.value / prevValue) * 100).toFixed(1);

        return (
          <g key={`stage-${idx}`}>
            {/* Trapezoid */}
            <polygon
              points={`${x1},${y1} ${x1 + topWidth},${y1} ${x2 + bottomWidth},${y2} ${x2},${y2}`}
              fill={stageColor}
              opacity={opacity}
              stroke={C.border}
              strokeWidth="1"
            />

            {/* Label */}
            <text
              x={padding.left + chartWidth / 2}
              y={y1 + stageHeight / 2 - 10}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill={opacity > 0.5 ? C.surface : C.text}
            >
              {stage.label}
            </text>

            {/* Value */}
            <text
              x={padding.left + chartWidth / 2}
              y={y1 + stageHeight / 2 + 8}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={opacity > 0.5 ? C.surface : C.text}
            >
              {stage.value}
            </text>

            {/* Conversion % */}
            {idx > 0 && (
              <text
                x={padding.left + chartWidth / 2}
                y={y1 + stageHeight / 2 + 22}
                textAnchor="middle"
                fontSize="10"
                fill={opacity > 0.5 ? C.surface : C.textMut}
              >
                {conversionPct}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export { DataTable, KPICard, SVGLineChart, SVGBarChart, SVGDonutChart, SVGHeatmap, SVGFunnel };
