"use client";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

export function Sparkline({ data }: { data: Array<{ run_date: string; score: number }> }) {
  if (!data || data.length < 2) {
    return <div className="muted small" style={{ height: 40, display: "grid", placeItems: "center" }}>no trend yet</div>;
  }
  const last = data[data.length - 1].score;
  const first = data[0].score;
  const color = last >= first ? "var(--good)" : "var(--bad)";
  return (
    <div style={{ height: 40, width: "100%" }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={[0, 100]} />
          <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
