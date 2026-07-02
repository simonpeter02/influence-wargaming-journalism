import type { ReactElement } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ROLE_META } from '@iwj/shared';
import type { TrajectoryPoint } from '@iwj/shared';

interface SeriesDef {
  key: keyof TrajectoryPoint;
  name: string;
  color: string;
  width: number;
  late: boolean;      // fades in after the WD line has drawn
  endLabel: boolean;  // direct label at the last point
}

const SERIES: SeriesDef[] = [
  { key: 'wd', name: 'Willingness to Defend', color: 'var(--series-wd)', width: 3, late: false, endLabel: true },
  { key: 'gp', name: 'Government Popularity', color: 'var(--series-gp)', width: 2, late: true, endLabel: true },
  { key: 'at1', name: `${ROLE_META.journalist_1.short} attention`, color: 'var(--series-at)', width: 2, late: true, endLabel: false },
  { key: 'at2', name: `${ROLE_META.journalist_2.short} attention`, color: 'var(--series-at2)', width: 2, late: true, endLabel: false },
  { key: 'at3', name: `${ROLE_META.journalist_3.short} attention`, color: 'var(--series-at3)', width: 2, late: true, endLabel: false },
];

const LATE_BEGIN_MS = 2500;

function makeEndLabel(shortName: string, lastIndex: number) {
  // Direct end-of-line label; text always in ink, never the series color.
  return function EndLabel(props: { x?: number; y?: number; index?: number }): ReactElement<SVGElement> {
    if (props.index !== lastIndex || props.x == null || props.y == null) return <g />;
    return (
      <text x={props.x + 10} y={props.y + 4} fontSize={12} fill="var(--text-secondary)">
        {shortName}
      </text>
    );
  };
}

/** The reveal chart: all five trajectories on ONE 0–100 axis. WD draws first; the rest fade in. */
export default function TrajectoryChart({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  const last = trajectory.length - 1;
  return (
    <div className="card">
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <span className="dot" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={trajectory} margin={{ top: 12, right: 150, bottom: 4, left: -14 }}>
            <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
              }}
              labelStyle={{ color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-secondary)' }}
              cursor={{ stroke: 'var(--border)' }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.width}
                dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive
                animationBegin={s.late ? LATE_BEGIN_MS : 0}
                animationDuration={s.late ? 900 : 2200}
                label={s.endLabel ? makeEndLabel(s.name.split(' ')[0] ?? s.name, last) : undefined}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
