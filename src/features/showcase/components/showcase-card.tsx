/**
 * 사이트 쇼케이스 카드와 그리드 (08-core/19-site-showcase.md Section 6 — 랜딩·/showcase가 같이 쓴다)
 *
 * - 썸네일이 없거나 불러오지 못하면 파비콘과 이름(사이트 이름 → 호스트)으로 대체 그림을 그린다(Section 1.2-4)
 * - 사이트 열기는 새 창, rel="nofollow ugc noopener noreferrer" — 사용자가 올린 외부 주소다
 * - 문서가 공유 중이면(shareToken) "ERD 보기"를 붙인다(Section 1.2-1)
 * - 신고는 로그인한 사람만(Section 3.7) — 비로그인은 공유 화면의 좋아요처럼 안내 토스트로 끝낸다
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Flag, Globe, Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { publicPath } from '@/components/public-chrome'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { showcaseImageUrl, siteHost, type ShowcaseSite } from '@/features/showcase/api'
import { ReportSiteDialog } from '@/features/showcase/components/report-site-dialog'
import { useSessionStore } from '@/stores/session'
import { cn } from 'cn'

/** 외부 사이트 링크의 rel — 사용자 등록 주소라 검색 순위를 넘기지 않는다(Section 6) */
export const SITE_LINK_REL = 'nofollow ugc noopener noreferrer'

/** 썸네일 칸 — 16:10(캡처 800×500). 실패하면 대체 그림으로 바꾼다 */
export function SiteThumbnail({
  thumbnailUrl,
  faviconUrl,
  name,
  className,
}: {
  thumbnailUrl: string | null
  faviconUrl: string | null
  name: string
  className?: string
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const src = showcaseImageUrl(thumbnailUrl)

  if (src && !thumbnailFailed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setThumbnailFailed(true)}
        className={cn('aspect-[16/10] w-full rounded-md border bg-muted object-cover object-top', className)}
        data-testid="showcase-thumbnail"
      />
    )
  }
  return (
    <div
      className={cn(
        'flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-md border bg-muted/60 px-4 text-center',
        className,
      )}
      data-testid="showcase-thumbnail-fallback"
    >
      {faviconUrl && !faviconFailed ? (
        <img
          src={faviconUrl}
          alt=""
          className="size-8 rounded"
          onError={() => setFaviconFailed(true)}
        />
      ) : (
        <Globe aria-hidden className="size-8 text-muted-foreground" />
      )}
      <span className="line-clamp-2 break-all text-sm font-medium text-muted-foreground">{name}</span>
    </div>
  )
}

export function ShowcaseCard({ site, onReport }: { site: ShowcaseSite; onReport: (site: ShowcaseSite) => void }) {
  const { t } = useTranslation()
  const host = siteHost(site.url)
  return (
    <Card className="h-full" data-testid="showcase-card">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        {/* 썸네일도 사이트로 간다 — 같은 행선지라 보조 기술에는 아래 "사이트 열기" 하나만 읽힌다 */}
        <a href={site.url} target="_blank" rel={SITE_LINK_REL} tabIndex={-1} aria-hidden>
          <SiteThumbnail
            thumbnailUrl={site.thumbnailUrl}
            faviconUrl={site.faviconUrl}
            name={site.siteName || host}
          />
        </a>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="break-words text-base font-semibold">{site.title}</h3>
          <span className="truncate text-xs text-muted-foreground">{host}</span>
          {site.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{site.description}</p>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 text-sm">
          <a
            href={site.url}
            target="_blank"
            rel={SITE_LINK_REL}
            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            data-testid="showcase-open-site"
          >
            {t('showcase.card.open')}
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
          {site.shareToken ? (
            <Link
              to={`/share/${site.shareToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
              data-testid="showcase-view-erd"
            >
              <Network aria-hidden className="size-4" />
              {t('showcase.card.viewErd')}
            </Link>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground"
            aria-label={t('showcase.card.report', { title: site.title })}
            title={t('showcase.report.title')}
            onClick={() => onReport(site)}
            data-testid="showcase-report"
          >
            <Flag aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** 카드 그리드 + 신고 다이얼로그 하나 — 로그인 여부를 여기서 가른다 */
export function ShowcaseGrid({ sites, testId }: { sites: ShowcaseSite[]; testId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const authenticated = useSessionStore((state) => state.status) === 'authenticated'
  const [reporting, setReporting] = useState<ShowcaseSite | null>(null)

  const handleReport = (site: ShowcaseSite) => {
    if (!authenticated) {
      // 신고는 로그인 전용 — 게이트웨이 401 전에 여기서 안내한다(요청도 낭비 없음)
      toast.info(t('showcase.report.loginRequired'), {
        action: { label: t('showcase.report.login'), onClick: () => navigate(publicPath('/login')) },
      })
      return
    }
    setReporting(site)
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid={testId}>
        {sites.map((site) => (
          <li key={site.siteId}>
            <ShowcaseCard site={site} onReport={handleReport} />
          </li>
        ))}
      </ul>
      <ReportSiteDialog site={reporting} onOpenChange={(open) => !open && setReporting(null)} />
    </>
  )
}
