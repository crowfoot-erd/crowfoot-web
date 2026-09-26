/**
 * 관리자 트래픽 통계 대시보드 (storyboard 03-admin §9 — 지표·API 원천 08-core/10-metrics.md)
 * 요약 카드 5장(어제 대비 배지) · 일별 추이 면적(이중 축·범례 토글) · 차원 탭
 * (구성비=도넛 / 순위=가로 막대 TOP 10 + TOP 20 표) · 공유 TOP · 로그인 선·기능 사용량.
 * 차트는 시각 보조, 표가 수치 원천 — 차트는 role="img" + aria-label.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { TrafficBreakdownEntry, TrafficDimension } from '@/api/types'
import {
  useTrafficActivity,
  useTrafficBreakdown,
  useTrafficSummary,
} from '@/features/metrics/hooks'
import { cn } from 'cn'

const PERIODS = [7, 28, 90] as const

/** 차원별 표현 — 구성비(폐쇄 집합·소수)는 도넛, 순위(롱테일)는 가로 막대 */
const DIMENSIONS: { value: TrafficDimension; kind: 'ratio' | 'rank' }[] = [
  { value: 'device', kind: 'ratio' },
  { value: 'browser', kind: 'ratio' },
  { value: 'os', kind: 'ratio' },
  { value: 'lang', kind: 'ratio' },
  { value: 'country', kind: 'rank' },
  { value: 'referrer', kind: 'rank' },
  { value: 'page', kind: 'rank' },
]

/** 도넛 조각 색 — --chart-* 팔레트 순환 */
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

/** 추이 차원(면적) — 왼쪽 축(규모 큰 PV·세션) / 오른쪽 축(UUV·신규) */
const SERIES = [
  { key: 'pv', axis: 'left', color: 'var(--chart-1)' },
  { key: 'sessions', axis: 'left', color: 'var(--chart-3)' },
  { key: 'uuv', axis: 'right', color: 'var(--chart-2)' },
  { key: 'newVisitors', axis: 'right', color: 'var(--chart-4)' },
] as const

type SeriesKey = (typeof SERIES)[number]['key']

/** path_group → 라우트 라벨 키 (10-metrics.md §4.4 매핑과 1:1) */
const PAGE_LABEL_KEYS: Record<string, string> = {
  '/': 'admin.traffic.page.root',
  '/login': 'admin.traffic.page.login',
  '/terms': 'admin.traffic.page.terms',
  '/workspaces': 'admin.traffic.page.workspaces',
  '/workspaces/*': 'admin.traffic.page.workspaceDetail',
  '/workspaces/*/models/*': 'admin.traffic.page.modelEditor',
  '/teams/*': 'admin.traffic.page.teams',
  '/community': 'admin.traffic.page.community',
  '/release-notes/*': 'admin.traffic.page.releaseNotes',
  '/share/*': 'admin.traffic.page.share',
  '/admin/*': 'admin.traffic.page.admin',
  other: 'admin.traffic.page.other',
  direct: 'admin.traffic.referrer.direct',
  internal: 'admin.traffic.referrer.internal',
}

/** 차원 값의 화면 표시명 — share는 서버 displayName, 국가·언어는 현지 언어명,
 *  페이지·유입은 라벨 매핑, 나머지는 원문 */
function localizedDimensionLabel(
  t: (key: string) => string,
  dim: TrafficDimension,
  entry: Pick<TrafficBreakdownEntry, 'key' | 'displayName'>,
  language: string,
): string {
  if (entry.displayName) return entry.displayName
  const key = entry.key
  if (dim === 'country' && key !== 'unknown') {
    try {
      return new Intl.DisplayNames([language, 'en'], { type: 'region' }).of(key) ?? key
    } catch {
      return key
    }
  }
  if (dim === 'lang' && key !== 'other') {
    try {
      return new Intl.DisplayNames([language, 'en'], { type: 'language' }).of(key) ?? key
    } catch {
      return key
    }
  }
  const i18nKey = dim === 'page' || dim === 'referrer' ? PAGE_LABEL_KEYS[key] : undefined
  return i18nKey ? t(i18nKey) : key
}

/** 어제 대비 증감 배지 — 어제 0이면 "신규", ±1% 미만은 동등 */
function DeltaBadge({ today, yesterday }: { today: number; yesterday: number }) {
  const { t } = useTranslation()
  if (yesterday === 0) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs font-normal">
        {today > 0 ? t('admin.traffic.delta.new') : <Minus aria-hidden className="h-3 w-3" />}
        {today === 0 ? '0' : ''}
      </Badge>
    )
  }
  const ratio = Math.round(((today - yesterday) / yesterday) * 100)
  const up = ratio > 0
  const flat = ratio === 0
  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-0.5 text-xs font-normal',
        up && 'text-emerald-600 dark:text-emerald-400',
        !up && !flat && 'text-red-600 dark:text-red-400',
      )}
    >
      {flat ? (
        <Minus aria-hidden className="h-3 w-3" />
      ) : up ? (
        <ArrowUpRight aria-hidden className="h-3 w-3" />
      ) : (
        <ArrowDownRight aria-hidden className="h-3 w-3" />
      )}
      {flat ? '0%' : `${up ? '+' : ''}${ratio}%`}
    </Badge>
  )
}

/** 요약 카드 1장 — 지표명·한 줄 정의·오늘 값·어제 대비 배지 */
function SummaryCard({ label, hint, today, yesterday }: {
  label: string
  hint: string
  today: number
  yesterday: number
}) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{today.toLocaleString()}</span>
          <DeltaBadge today={today} yesterday={yesterday} />
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function ChartSkeleton({ height }: { height: number }) {
  return <Skeleton className="w-full" style={{ height }} />
}

/** 일별 추이 — 면적 4계열·이중 축·범례 클릭 토글 */
function TrendChart({ series }: { series: { date: string; pv: number; uuv: number; sessions: number; newVisitors: number }[] }) {
  const { t, i18n } = useTranslation()
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set())

  const labels: Record<SeriesKey, string> = {
    pv: t('admin.traffic.metric.pv'),
    sessions: t('admin.traffic.metric.sessions'),
    uuv: t('admin.traffic.metric.uuv'),
    newVisitors: t('admin.traffic.metric.newVisitors'),
  }
  const toggle = (key: string | undefined) => {
    if (!key) return
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key as SeriesKey)) next.delete(key as SeriesKey)
      else next.add(key as SeriesKey)
      return next
    })
  }

  return (
    <div className="h-80 w-full" role="img" aria-label={t('admin.traffic.chart.trendAria')}>
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.04} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => v.slice(5).replace('-', '/')}
            tick={{ fontSize: 12 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={44} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={44} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) => [
              Number(value ?? 0).toLocaleString(),
              labels[name as SeriesKey] ?? String(name),
            ]}
            labelFormatter={(v) =>
              new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(
                new Date(`${String(v)}T00:00:00+09:00`),
              )
            }
          />
          <Legend
            formatter={(value: string) => labels[value as SeriesKey] ?? value}
            onClick={(entry) =>
              toggle(
                entry?.dataKey === undefined
                  ? (entry as unknown as { value?: string })?.value
                  : String(entry.dataKey),
              )
            }
          />
          {SERIES.filter((s) => s.axis === 'left').map((s) => (
            <Area
              key={s.key}
              yAxisId="left"
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={`url(#fill-${s.key})`}
              strokeWidth={2}
              hide={hidden.has(s.key)}
            />
          ))}
          {SERIES.filter((s) => s.axis === 'right').map((s) => (
            <Area
              key={s.key}
              yAxisId="right"
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={`url(#fill-${s.key})`}
              strokeWidth={2}
              hide={hidden.has(s.key)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 구성비 도넛 — 중앙 기간 총계, 조각=차원 값 */
function RatioDonut({ data, total, ariaLabel }: { data: { name: string; value: number }[]; total: number; ariaLabel: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <text x="50%" y="47%" textAnchor="middle" className="fill-foreground text-2xl font-semibold">
            {total.toLocaleString()}
          </text>
          <text x="50%" y="57%" textAnchor="middle" className="fill-muted-foreground text-xs">
            {ariaLabel.split(' ')[0]}
          </text>
          <Tooltip formatter={(value, name) => [Number(value ?? 0).toLocaleString(), String(name)]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** 순위 가로 막대 TOP 10 — 막대 끝 수치·비율은 툴팁 */
function RankBar({ data, ariaLabel }: { data: { name: string; value: number }[]; ariaLabel: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 12 }}
            stroke="var(--muted-foreground)"
          />
          <Tooltip formatter={(value) => Number(value ?? 0).toLocaleString()} />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** TOP 20 표 — 표시명·건수·점유율 %. 수치 원천은 이 표다 */
function BreakdownTable({
  entries,
  dimension,
  keyHeader,
}: {
  entries: TrafficBreakdownEntry[]
  dimension: TrafficDimension
  keyHeader: string
}) {
  const { t, i18n } = useTranslation()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{keyHeader}</TableHead>
          <TableHead className="text-right">{t('admin.traffic.table.count')}</TableHead>
          <TableHead className="text-right">{t('admin.traffic.table.share')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, i) => (
          <TableRow key={entry.key}>
            <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
            <TableCell>{localizedDimensionLabel(t, dimension, entry, i18n.language)}</TableCell>
            <TableCell className="text-right tabular-nums">{entry.count.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{(entry.share * 100).toFixed(1)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function AdminTrafficPage() {
  const { t, i18n } = useTranslation()
  const [days, setDays] = useState<number>(28)
  const [dimension, setDimension] = useState<TrafficDimension>('device')

  const summary = useTrafficSummary(days)
  const breakdown = useTrafficBreakdown(dimension, days)
  const share = useTrafficBreakdown('share', days)
  const activity = useTrafficActivity(days)

  const activeKind = DIMENSIONS.find((d) => d.value === dimension)?.kind ?? 'ratio'
  const chartData = useMemo(() => {
    if (!breakdown.data) return []
    return breakdown.data.entries
      .slice(0, 10)
      .map((e) => ({ name: localizedDimensionLabel(t, dimension, e, i18n.language), value: e.count }))
  }, [breakdown.data, dimension, t, i18n.language])

  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('admin.traffic.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.traffic.subtitle')}</p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p} value={String(p)}>
                {t('admin.traffic.period.days', { days: p })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 요약 카드 5장 */}
      {summary.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <ChartSkeleton key={i} height={104} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label={t('admin.traffic.metric.pv')}
            hint={t('admin.traffic.metric.pvHint')}
            today={summary.data?.today.pv ?? 0}
            yesterday={summary.data?.yesterday.pv ?? 0}
          />
          <SummaryCard
            label={t('admin.traffic.metric.uuv')}
            hint={t('admin.traffic.metric.uuvHint')}
            today={summary.data?.today.uuv ?? 0}
            yesterday={summary.data?.yesterday.uuv ?? 0}
          />
          <SummaryCard
            label={t('admin.traffic.metric.sessions')}
            hint={t('admin.traffic.metric.sessionsHint')}
            today={summary.data?.today.sessions ?? 0}
            yesterday={summary.data?.yesterday.sessions ?? 0}
          />
          <SummaryCard
            label={t('admin.traffic.metric.newVisitors')}
            hint={t('admin.traffic.metric.newVisitorsHint')}
            today={summary.data?.today.newVisitors ?? 0}
            yesterday={summary.data?.yesterday.newVisitors ?? 0}
          />
          <SummaryCard
            label={t('admin.traffic.metric.bot')}
            hint={t('admin.traffic.metric.botHint')}
            today={summary.data?.today.bot ?? 0}
            yesterday={summary.data?.yesterday.bot ?? 0}
          />
        </div>
      )}

      {/* 일별 추이 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.traffic.chart.trendTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.isPending ? (
            <ChartSkeleton height={320} />
          ) : (
            <TrendChart series={summary.data?.series ?? []} />
          )}
        </CardContent>
      </Card>

      {/* 차원별 분포 */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t('admin.traffic.breakdown.title')}</CardTitle>
          <Tabs value={dimension} onValueChange={(v) => setDimension(v as TrafficDimension)}>
            <TabsList className="flex-wrap">
              {DIMENSIONS.map((d) => (
                <TabsTrigger key={d.value} value={d.value}>
                  {t(`admin.traffic.dimension.${d.value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          {breakdown.isError ? (
            <ErrorState onRetry={() => void breakdown.refetch()} />
          ) : breakdown.isPending ? (
            <ChartSkeleton height={288} />
          ) : (breakdown.data?.entries.length ?? 0) === 0 ? (
            <EmptyState title={t('admin.traffic.breakdown.empty')} />
          ) : (
            <>
              {activeKind === 'ratio' ? (
                <RatioDonut
                  data={chartData}
                  total={breakdown.data?.total ?? 0}
                  ariaLabel={t(`admin.traffic.dimension.${dimension}`)}
                />
              ) : (
                <RankBar data={chartData} ariaLabel={t(`admin.traffic.dimension.${dimension}`)} />
              )}
              <BreakdownTable
                entries={breakdown.data?.entries ?? []}
                dimension={dimension}
                keyHeader={t(`admin.traffic.dimension.${dimension}`)}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* 공유 문서 TOP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.traffic.share.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {share.isPending ? (
            <ChartSkeleton height={288} />
          ) : (share.data?.entries.length ?? 0) === 0 ? (
            <EmptyState title={t('admin.traffic.share.empty')} />
          ) : (
            <>
              <RankBar
                data={(share.data?.entries ?? [])
                  .slice(0, 10)
                  .map((e) => ({ name: e.displayName ?? e.key, value: e.count }))}
                ariaLabel={t('admin.traffic.share.title')}
              />
              <BreakdownTable
                entries={share.data?.entries ?? []}
                dimension="share"
                keyHeader={t('admin.traffic.share.document')}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* 로그인·기능 사용량 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.traffic.activity.loginTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.isPending ? (
              <ChartSkeleton height={288} />
            ) : (
              <div className="h-72 w-full" role="img" aria-label={t('admin.traffic.activity.loginAria')}>
                <ResponsiveContainer>
                  <LineChart data={activity.data?.logins ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => v.slice(5).replace('-', '/')}
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={44} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => [
                        Number(value ?? 0).toLocaleString(),
                        t(`admin.traffic.activity.${String(name)}`),
                      ]}
                    />
                    <Legend formatter={(value: string) => t(`admin.traffic.activity.${value}`)} />
                    <Line
                      type="monotone"
                      dataKey="succeeded"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="failed"
                      stroke="var(--destructive)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.traffic.activity.actionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.isPending ? (
              <ChartSkeleton height={288} />
            ) : (activity.data?.actions.length ?? 0) === 0 ? (
              <EmptyState title={t('admin.traffic.activity.empty')} />
            ) : (
              <div className="h-72 w-full" role="img" aria-label={t('admin.traffic.activity.actionsAria')}>
                <ResponsiveContainer>
                  <BarChart
                    data={(activity.data?.actions ?? []).slice(0, 10).map((a) => ({ name: a.action, value: a.count }))}
                    layout="vertical"
                    margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip formatter={(value) => Number(value ?? 0).toLocaleString()} />
                    <Bar dataKey="value" fill="var(--chart-3)" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
