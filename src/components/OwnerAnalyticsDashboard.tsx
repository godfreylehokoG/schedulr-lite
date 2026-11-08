import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBooking } from '@/contexts/BookingContext';
import { Activity, CalendarClock, CheckCircle2, Clock3, Users } from 'lucide-react';
import { Booking, BookingStatus } from '@/types/booking';

type AnalyticsRange = '30d' | '90d' | '12m' | 'all';

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '12m', label: '12M' },
  { value: 'all', label: 'All' },
];

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
};

export const OwnerAnalyticsDashboard: React.FC = () => {
  const { bookings } = useBooking();
  const [range, setRange] = useState<AnalyticsRange>('90d');

  const analytics = useMemo(() => buildAnalytics(bookings, range), [bookings, range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">Analytics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {analytics.rangeLabel}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-black/10 bg-white/70 p-1 shadow-sm backdrop-blur-xl">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={range === option.value ? 'default' : 'ghost'}
              className="h-8 px-3"
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="Bookings"
          value={analytics.filteredBookings.length}
          detail={`${analytics.upcomingCount} upcoming`}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          label="Patients"
          value={analytics.patientCount}
          detail={`${analytics.repeatPatientCount} returning`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Completed"
          value={analytics.completedCount}
          detail={`${analytics.completionRate}% completion`}
        />
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label="Utilization"
          value={`${analytics.averagePerActiveDay}`}
          detail="avg per active day"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-muted-foreground" />
              Bookings Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.trend.length === 0 ? (
              <EmptyPanel label="No booking activity in this range" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.trend} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#d4d4d4" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={12} />
                    <RechartsTooltip
                      cursor={{ stroke: '#111111', strokeWidth: 1 }}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.12)',
                        boxShadow: '0 18px 40px rgba(0,0,0,0.12)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="bookings"
                      stroke="#111111"
                      strokeWidth={2}
                      fill="#111111"
                      fillOpacity={0.08}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Mix</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.statusData.every((entry) => entry.count === 0) ? (
              <EmptyPanel label="No statuses to compare" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.statusData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#d4d4d4" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={12} />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.12)',
                        boxShadow: '0 18px 40px rgba(0,0,0,0.12)',
                      }}
                    />
                    <Bar dataKey="count" fill="#111111" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.weekdayData.every((entry) => entry.bookings === 0) ? (
            <EmptyPanel label="No weekday pattern yet" />
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.weekdayData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#d4d4d4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={12} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.12)',
                      boxShadow: '0 18px 40px rgba(0,0,0,0.12)',
                    }}
                  />
                  <Bar dataKey="bookings" fill="#111111" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">
          {icon}
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-normal">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-black/10 bg-white/50 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function buildAnalytics(bookings: Booking[], range: AnalyticsRange) {
  const now = new Date();
  const rangeStart = getRangeStart(now, range);
  const filteredBookings = bookings.filter((booking) => {
    const startsAt = new Date(booking.appointmentStartUtc);
    return !rangeStart || startsAt >= rangeStart;
  });
  const pastPatientEmails = new Set(
    bookings
      .filter((booking) => new Date(booking.appointmentStartUtc) < now && booking.status !== 'cancelled')
      .map((booking) => booking.customerEmail.toLowerCase()),
  );
  const patientVisitCounts = new Map<string, number>();

  filteredBookings.forEach((booking) => {
    if (booking.status !== 'cancelled') {
      const email = booking.customerEmail.toLowerCase();
      patientVisitCounts.set(email, (patientVisitCounts.get(email) || 0) + 1);
    }
  });

  const completedCount = filteredBookings.filter((booking) => booking.status === 'completed').length;
  const upcomingCount = filteredBookings.filter(
    (booking) => booking.status === 'confirmed' && new Date(booking.appointmentStartUtc) >= now,
  ).length;
  const activeDays = new Set(
    filteredBookings.map((booking) => booking.appointmentStartUtc.slice(0, 10)),
  ).size;
  const averagePerActiveDay =
    activeDays === 0 ? '0.0' : (filteredBookings.length / activeDays).toFixed(1);

  return {
    filteredBookings,
    rangeLabel: labelForRange(range),
    patientCount: pastPatientEmails.size,
    repeatPatientCount: [...patientVisitCounts.values()].filter((count) => count > 1).length,
    completedCount,
    completionRate:
      filteredBookings.length === 0 ? 0 : Math.round((completedCount / filteredBookings.length) * 100),
    upcomingCount,
    averagePerActiveDay,
    trend: buildTrend(filteredBookings, range, now),
    statusData: buildStatusData(filteredBookings),
    weekdayData: buildWeekdayData(filteredBookings),
  };
}

function getRangeStart(now: Date, range: AnalyticsRange): Date | null {
  if (range === 'all') {
    return null;
  }

  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function labelForRange(range: AnalyticsRange) {
  if (range === 'all') {
    return 'All recorded booking activity';
  }

  if (range === '12m') {
    return 'Booking performance over the last 12 months';
  }

  return `Booking performance over the last ${range.replace('d', ' days')}`;
}

function buildTrend(bookings: Booking[], range: AnalyticsRange, now: Date) {
  const granularity = range === '30d' ? 'day' : 'month';
  const start = getRangeStart(now, range) || earliestBookingDate(bookings);

  if (!start) {
    return [];
  }

  const buckets = new Map<string, { label: string; bookings: number }>();
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= now) {
    const key = granularity === 'day' ? dateKey(cursor) : monthKey(cursor);
    buckets.set(key, {
      label: granularity === 'day' ? shortDateLabel(cursor) : shortMonthLabel(cursor),
      bookings: 0,
    });
    if (granularity === 'day') {
      cursor.setDate(cursor.getDate() + 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  bookings.forEach((booking) => {
    const startsAt = new Date(booking.appointmentStartUtc);
    const key = granularity === 'day' ? dateKey(startsAt) : monthKey(startsAt);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.bookings += 1;
    }
  });

  return [...buckets.values()];
}

function buildStatusData(bookings: Booking[]) {
  return (Object.keys(STATUS_LABELS) as BookingStatus[]).map((status) => ({
    label: STATUS_LABELS[status],
    count: bookings.filter((booking) => booking.status === status).length,
  }));
}

function buildWeekdayData(bookings: Booking[]) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels.map((label, day) => ({
    label,
    bookings: bookings.filter((booking) => new Date(booking.appointmentStartUtc).getDay() === day).length,
  }));
}

function earliestBookingDate(bookings: Booking[]) {
  if (bookings.length === 0) {
    return null;
  }

  return new Date(
    Math.min(...bookings.map((booking) => new Date(booking.appointmentStartUtc).getTime())),
  );
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
}

function shortDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function shortMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date);
}
