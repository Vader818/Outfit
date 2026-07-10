type DistributionBarsProps = {
  data: Record<string, number>;
  empty?: string;
  kind?: "share" | "score";
  unit?: string;
  includeZero?: boolean;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function DistributionBars({
  data,
  empty = "暂无分布数据。",
  kind = "share",
  unit = "件",
  includeZero = false
}: DistributionBarsProps) {
  const entries = Object.entries(data)
    .map(([label, value]) => [label, Number(value)] as const)
    .filter(([, value]) => Number.isFinite(value) && (includeZero ? value >= 0 : value > 0));
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);

  if (!entries.length) {
    return <p className="distribution-bars__empty">{empty}</p>;
  }

  return (
    <ul className="distribution-bars">
      {entries.map(([label, value]) => {
        const percent = kind === "score" ? clampPercent(value) : total > 0 ? clampPercent((value / total) * 100) : 0;
        const valueText = kind === "score" ? `${Math.round(value)} ${unit}` : `${value} ${unit}`;
        return (
          <li className="distribution-bar" key={label}>
            <div className="distribution-bar__heading">
              <span>{label}</span>
              <strong>{valueText}</strong>
            </div>
            <div className="distribution-bar__measure">
              <meter
                className="distribution-bar__meter"
                min={0}
                max={100}
                value={percent}
                optimum={100}
                aria-label={`${label} ${kind === "score" ? "得分" : "占比"} ${percent}%`}
              >
                {percent}%
              </meter>
              <small>{percent}%</small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
