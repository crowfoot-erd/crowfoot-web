/**
 * 만든 사이트 목록 /showcase (08-core/19-site-showcase.md Section 6·3.5)
 *
 * - 랜딩 "만든 사이트" 섹션의 "더보기"가 여는 화면. 인증 없이 연다. 머리와 바닥은 랜딩과 같다
 * - 최근 등록순 카드 그리드에 "더 보기"로 다음 페이지를 붙인다(공유 문서 목록의 페이지 이동과 달리 이어 붙인다)
 * - 카드는 랜딩과 같은 꼴(사이트 열기·ERD 보기·신고)
 */
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicFooter, PublicHeader } from '@/components/public-chrome'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ShowcaseGrid } from '@/features/showcase/components/showcase-card'
import { useShowcaseSites } from '@/features/showcase/hooks'
import { usePageMeta } from '@/hooks/usePageMeta'

export function ShowcasePage() {
  const { t } = useTranslation()
  usePageMeta({
    title: `${t('showcase.title')} — ${t('common.appName')}`,
    description: t('showcase.description'),
    canonicalPath: '/showcase',
  })

  const list = useShowcaseSites()
  const items = list.data?.pages.flatMap((page) => page.items) ?? []
  const totalCount = list.data?.pages[0]?.totalCount ?? 0

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('showcase.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('showcase.description')}</p>
          </div>
          {list.data ? (
            <span className="text-sm tabular-nums text-muted-foreground" data-testid="showcase-count">
              {t('showcase.count', { count: totalCount })}
            </span>
          ) : null}
        </div>

        {list.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={t('common.loading')}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-64 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground" role="alert">
            {t('showcase.error')}
          </p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground" data-testid="showcase-empty">
            {t('showcase.empty')}
          </p>
        ) : (
          <>
            <ShowcaseGrid sites={items} testId="showcase-list" />
            {list.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  data-testid="showcase-load-more"
                >
                  {list.isFetchingNextPage ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  {t('showcase.loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  )
}
