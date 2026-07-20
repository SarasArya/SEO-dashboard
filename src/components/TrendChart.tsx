"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { formatDateShort } from "@/lib/format";

export interface ScorePoint {
  run_date: string;
  score: number;
}

// Detect "major score drops" to annotate as markers (deploys / regressions).
function majorDrops(data: ScorePoint[], threshold = 8): ScorePoint[] {
  const out: ScorePoint[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1].score - data[i].score >= threshold) out.push(data[i]);
  }
  return out;
}

export function TrendChart({
  data,
  selectedDate,
  onSelectDate,
}: {
  data: ScorePoint[];
  selectedDate: string | null;
  onSelectDate: (runDate: string) => void;
}) {
  if (!data || data.length === 0) {
    return <div className="empty">No score history for this filter.</div>;
  }
  const drops = majorDrops(data);

  return (
    <div style={{ height: 300, width: "100%" }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 8, left: -12 }}
          onClick={(e: { activeLabel?: string | number }) => {
            if (e && e.activeLabel != null) onSelectDate(String(e.activeLabel));
          }}
        >
          <CartesianGrid stroke="#232a36" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="run_date"
            tickFormatter={formatDateShort}
            stroke="#8b95a7"
            fontSize={11}
            minTickGap={40}
          />
          <YAxis domain={[0, 100]} stroke="#8b95a7" fontSize={11} width={44} />
          <Tooltip
            contentStyle={{ background: "#1b2230", border: "1px solid #232a36", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(l) => formatDateShort(String(l))}
            formatter={(v: number) => [`${v}`, "score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#4f9cf9"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, style: { cursor: "pointer" } }}
            isAnimationActive={false}
          />
          {drops.map((d) => (
            <ReferenceDot
              key={`drop-${d.run_date}`}
              x={d.run_date}
              y={d.score}
              r={4}
              fill="#ef4444"
              stroke="#0b0e14"
            />
          ))}
          {selectedDate && (
            <ReferenceDot
              x={selectedDate}
              y={data.find((p) => p.run_date === selectedDate)?.score ?? 0}
              r={6}
              fill="#f59e0b"
              stroke="#0b0e14"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="muted small" style={{ marginTop: 6 }}>
        <span style={{ color: "#ef4444" }}>●</span> major score drop · click any point to load that day&apos;s issue snapshot
      </div>
    </div>
  );
}
