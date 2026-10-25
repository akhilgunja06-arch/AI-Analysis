import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ExchangeStatus } from '@/lib/types';

/**
 * Chart widgets.
 *
 * Each chart takes already-computed series from the API. Nothing is invented in
 * the browser, and every chart renders an explicit empty state when the series
 * is empty rather than drawing a misleading flat line.
 */

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'rgb(var(--ss-text-subtle))',
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--ss-bg-alt))',
  border: '1px solid rgb(var(--ss-border-strong))',
  borderRadius: '0.75rem',
  fontSize: '0.75rem',
  padding: '0.5rem 0.75rem',
  color: 'rgb(var(--ss-text))',
} as const;

function ChartEmpty({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed text-center text-sm ss-muted"
      style={{ height }}
    >
      <p className="max-w-xs px-4">{message}</p>
    </div>
  );
}

/** Sessions or minutes over the last weeks. */
export function ActivityAreaChart({
  data,
  dataKey = 'count',
  height = 220,
  emptyMessage = 'No recorded activity yet. Sessions and messages will show up here.',
  unit = '',
}: {
  data: { label: string; count: number }[];
  dataKey?: string;
  height?: number;
  emptyMessage?: string;
  unit?: string;
}) {
  const hasData = data.some((point) => point.count > 0);
  if (!hasData) return <ChartEmpty height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="ss-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ss-border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [`${value}${unit ? ` ${unit}` : ''}`, '']}
          labelStyle={{ color: 'rgb(var(--ss-text-muted))' }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="#6366F1"
          strokeWidth={2}
          fill="url(#ss-area-fill)"
          dot={{ r: 2.5, strokeWidth: 0, fill: '#6366F1' }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Weekly learning minutes as bars. */
export function LearningBarChart({
  data,
  height = 220,
  emptyMessage = 'No completed sessions yet, so there are no learning minutes to chart.',
}: {
  data: { label: string; minutes: number; sessions: number }[];
  height?: number;
  emptyMessage?: string;
}) {
  const hasData = data.some((point) => point.minutes > 0);
  if (!hasData) return <ChartEmpty height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ss-border))" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [
            name === 'minutes' ? `${value} min` : `${value}`,
            name === 'minutes' ? 'Learning time' : 'Sessions',
          ]}
          labelStyle={{ color: 'rgb(var(--ss-text-muted))' }}
        />
        <Bar dataKey="minutes" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const STATUS_COLOURS: Record<string, string> = {
  PENDING: '#F59E0B',
  COUNTERED: '#0EA5E9',
  ACCEPTED: '#38BDF8',
  ACTIVE: '#10B981',
  PAUSED: '#F97316',
  COMPLETED: '#6366F1',
  DECLINED: '#F43F5E',
  WITHDRAWN: '#94A3B8',
  CANCELLED: '#64748B',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  COUNTERED: 'Counter-proposed',
  ACCEPTED: 'Accepted',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
};

/** Exchange status donut. */
export function ExchangeDonutChart({
  data,
  height = 220,
  emptyMessage = 'No exchanges yet. Once you accept a request it will appear here.',
}: {
  data: { status: ExchangeStatus; count: number }[];
  height?: number;
  emptyMessage?: string;
}) {
  const series = data.filter((item) => item.count > 0);
  if (series.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={series}
          dataKey="count"
          nameKey="status"
          innerRadius="52%"
          outerRadius="78%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {series.map((item) => (
            <Cell key={item.status} fill={STATUS_COLOURS[item.status] ?? '#94A3B8'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number, _name, entry) => [
            `${value}`,
            STATUS_LABELS[(entry as { payload?: { status?: string } }).payload?.status ?? ''] ?? 'Exchanges',
          ]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span style={{ fontSize: 11, color: 'rgb(var(--ss-text-muted))' }}>
              {STATUS_LABELS[value] ?? value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Signups per day for the admin panel. */
export function SignupTrendChart({
  data,
  height = 200,
}: {
  data: { date: string; count: number }[];
  height?: number;
}) {
  const hasData = data.some((point) => point.count > 0);
  if (!hasData) return <ChartEmpty height={height} message="No new accounts in this period." />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="ss-signup-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ss-border))" vertical={false} />
        <XAxis dataKey="date" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'rgb(var(--ss-text-muted))' }} />
        <Area type="monotone" dataKey="count" stroke="#0EA5E9" strokeWidth={2} fill="url(#ss-signup-fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
