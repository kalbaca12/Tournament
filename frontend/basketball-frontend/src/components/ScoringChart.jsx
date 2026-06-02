import { useMemo, useRef, useState } from "react";
import { formatLiveEventLabel } from "../utils/liveEventLabels";

const DEFAULT_QUARTER_SECONDS = 10 * 60;

function clampQuarterSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_QUARTER_SECONDS;
  return Math.max(60, Math.min(20 * 60, Math.round(seconds)));
}

function eventMatchSecond(event, quarterSeconds) {
  const quarter = Math.max(1, Math.min(4, Number(event?.quarter) || 1));
  const elapsed = Math.max(0, Math.min(quarterSeconds, Number(event?.elapsed) || 0));
  return ((quarter - 1) * quarterSeconds) + elapsed;
}

function eventPoints(event) {
  if (event?.type === "shot" && event.made) return Number(event.points) || 0;
  if (event?.type === "free_throw" && event.made) return 1;
  return 0;
}

function eventStatName(event) {
  const labels = {
    shot: "Shot",
    free_throw: "Free throw",
    rebound: "Rebound",
    block: "Block",
    steal: "Steal",
    foul: "Foul",
    turnover: "Turnover",
    substitution: "Substitution",
    quarter_end: "Quarter ended",
  };
  return labels[event?.type] || "Play";
}

function buildScoreChartData(events, quarterSeconds) {
  const matchSeconds = quarterSeconds * 4;
  const linePoints = [{ second: 0, home: 0, away: 0 }];
  const markers = [];
  let home = 0;
  let away = 0;

  [...events]
    .sort((a, b) => eventMatchSecond(a, quarterSeconds) - eventMatchSecond(b, quarterSeconds))
    .forEach((event) => {
      const points = eventPoints(event);
      const side = ["home", "away"].includes(event.teamSide) ? event.teamSide : "";
      const second = eventMatchSecond(event, quarterSeconds);

      if (points > 0 && side === "home") home += points;
      if (points > 0 && side === "away") away += points;
      if (points > 0 && side) linePoints.push({ second, home, away });
      if (side) {
        markers.push({
          event,
          second,
          side,
          points,
          score: side === "home" ? home : away,
          home,
          away,
        });
      }
    });

  const lastPoint = linePoints[linePoints.length - 1];
  if (lastPoint.second < matchSeconds) {
    linePoints.push({ ...lastPoint, second: matchSeconds });
  }

  return { linePoints, markers };
}

export default function ScoringChart({ events, homeName, awayName, playersById, matchRow, resolveTeamName, quarterLengthSeconds }) {
  const quarterSeconds = clampQuarterSeconds(quarterLengthSeconds);
  const matchSeconds = quarterSeconds * 4;
  const { linePoints, markers } = useMemo(() => buildScoreChartData(events, quarterSeconds), [events, quarterSeconds]);
  const chartRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const maxScore = Math.max(1, ...linePoints.flatMap((point) => [point.home, point.away]));
  const width = 720;
  const height = 264;
  const padding = { top: 16, right: 16, bottom: 32, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (second) => padding.left + (Math.max(0, Math.min(matchSeconds, second)) / matchSeconds) * plotWidth;
  const y = (score) => padding.top + plotHeight - (Math.max(0, score) / maxScore) * plotHeight;
  const pathFor = (key) => linePoints.reduce((parts, point, index) => {
    if (index === 0) return [`M ${x(point.second)} ${y(point[key])}`];
    const previous = linePoints[index - 1];
    return [
      ...parts,
      `L ${x(point.second)} ${y(previous[key])}`,
      `L ${x(point.second)} ${y(point[key])}`,
    ];
  }, []).join(" ");
  const scoreTicks = Array.from(new Set([0, Math.ceil(maxScore / 2), maxScore]));

  const updateTooltipPosition = (event, marker) => {
    const chartBounds = chartRef.current?.getBoundingClientRect();
    const svgBounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const hasPointerPosition = Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
    const label = formatLiveEventLabel(marker.event, playersById, matchRow, resolveTeamName);
    setTooltip({
      x: hasPointerPosition && chartBounds
        ? event.clientX - chartBounds.left + chartRef.current.scrollLeft
        : x(marker.second) + (svgBounds.left - (chartBounds?.left ?? svgBounds.left)),
      y: hasPointerPosition && chartBounds
        ? event.clientY - chartBounds.top + chartRef.current.scrollTop
        : y(marker.score) + (svgBounds.top - (chartBounds?.top ?? svgBounds.top)),
      team: marker.side === "home" ? homeName : awayName,
      time: `Q${marker.event.quarter} ${marker.event.clock || ""}`.trim(),
      statName: eventStatName(marker.event),
      score: `${marker.home}-${marker.away}`,
      label,
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          {homeName}
        </span>
        <span className="inline-flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          {awayName}
        </span>
      </div>
      <div ref={chartRef} className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scoring timeline chart" className="min-w-[560px]">
          {scoreTicks.map((tick) => (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="0.6" />
              <text x={padding.left - 9} y={y(tick) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{tick}</text>
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((quarter) => {
            const second = quarter * quarterSeconds;
            return (
              <g key={quarter}>
                <line x1={x(second)} x2={x(second)} y1={padding.top} y2={height - padding.bottom} stroke="#e2e8f0" strokeWidth="0.6" />
                <text x={x(second)} y={height - 12} textAnchor="middle" className="fill-slate-500 text-[10px]">
                  {quarter === 0 ? "Start" : `Q${quarter}`}
                </text>
              </g>
            );
          })}
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="0.6" />
          <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="0.6" />
          <path d={pathFor("home")} fill="none" stroke="#0ea5e9" strokeWidth="1.1" strokeLinecap="square" strokeLinejoin="miter" />
          <path d={pathFor("away")} fill="none" stroke="#f43f5e" strokeWidth="1.1" strokeLinecap="square" strokeLinejoin="miter" />
          {markers.map((marker, index) => {
            const color = marker.side === "home" ? "#0ea5e9" : "#f43f5e";
            const isScoringPlay = marker.points > 0;
            return (
              <circle
                key={`${marker.event.id || `${marker.second}-${marker.event.type}`}-${index}`}
                cx={x(marker.second)}
                cy={y(marker.score)}
                r={isScoringPlay ? 1.9 : 1.75}
                fill={isScoringPlay ? color : "#ffffff"}
                stroke={color}
                strokeWidth={isScoringPlay ? "0.9" : "1.05"}
                opacity={isScoringPlay ? "1" : "0.9"}
                onMouseEnter={(event) => updateTooltipPosition(event, marker)}
                onMouseMove={(event) => updateTooltipPosition(event, marker)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={(event) => updateTooltipPosition(event, marker)}
                onBlur={() => setTooltip(null)}
                tabIndex="0"
              />
            );
          })}
        </svg>
        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${Math.max(tooltip.x + 14, 8)}px`,
              top: `${Math.max(tooltip.y - 24, 8)}px`,
            }}
          >
            <div className="font-semibold text-slate-900">{tooltip.time} - {tooltip.statName}</div>
            <div className="mt-0.5 text-slate-600">{tooltip.label}</div>
            <div className="mt-1 font-semibold text-slate-700">Score {tooltip.score}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
