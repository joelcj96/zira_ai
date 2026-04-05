import { useRef, useState } from "react";

function OutcomeSparkline({ points = [], direction = "flat", title = "", formatTooltip }) {
  const [activePoint, setActivePoint] = useState(null);
  const pointRefs = useRef([]);

  if (!points || points.length === 0) {
    return null;
  }

  const width = 220;
  const height = 54;
  const paddingX = 8;
  const paddingY = 8;

  const maxScore = 100;
  const minScore = 0;
  const xStep = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : 0;

  const getY = (score) => {
    const ratio = (score - minScore) / (maxScore - minScore || 1);
    return height - paddingY - ratio * (height - paddingY * 2);
  };

  const polylinePoints = points
    .map((item, index) => `${paddingX + index * xStep},${getY(item.score)}`)
    .join(" ");

  const strokeClass =
    direction === "improving"
      ? "sparkline-stroke-improving"
      : direction === "declining"
      ? "sparkline-stroke-declining"
      : "sparkline-stroke-flat";

  return (
    <div className="outcome-sparkline-wrap" role="img" aria-label={title || "Outcome trend sparkline"}>
      <svg viewBox={`0 0 ${width} ${height}`} className="outcome-sparkline" preserveAspectRatio="none">
        <polyline points={polylinePoints} className={`sparkline-line ${strokeClass}`} />
        {points.map((item, index) => (
          <circle
            key={`${item.label}-${index}`}
            cx={paddingX + index * xStep}
            cy={getY(item.score)}
            r={activePoint?.index === index ? "4" : "2.6"}
            className={`sparkline-point ${strokeClass}`}
            tabIndex={0}
            focusable="true"
            aria-label={
              typeof formatTooltip === "function"
                ? formatTooltip(item, index)
                : `${item.label}: ${item.outcome} (${item.score})`
            }
            onMouseEnter={() => setActivePoint({ index, item })}
            onMouseLeave={() => setActivePoint(null)}
            onFocus={() => setActivePoint({ index, item })}
            onBlur={() => setActivePoint(null)}
            ref={(node) => {
              pointRefs.current[index] = node;
            }}
            onKeyDown={(event) => {
              const moveToIndex = (targetIndex) => {
                const clamped = Math.max(0, Math.min(points.length - 1, targetIndex));
                const target = pointRefs.current[clamped];
                if (target) target.focus();
              };

              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveToIndex(index + 1);
                return;
              }

              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveToIndex(index - 1);
                return;
              }

              if (event.key === "Home") {
                event.preventDefault();
                moveToIndex(0);
                return;
              }

              if (event.key === "End") {
                event.preventDefault();
                moveToIndex(points.length - 1);
                return;
              }

              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
          />
        ))}
      </svg>
      {activePoint && (
        <div className="sparkline-tooltip">
          {typeof formatTooltip === "function"
            ? formatTooltip(activePoint.item, activePoint.index)
            : `${activePoint.item.label}: ${activePoint.item.outcome} (${activePoint.item.score})`}
        </div>
      )}
      <div className="sparkline-footer">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export default OutcomeSparkline;
