/**
 * 릴리스 노트 공개 화면 /release-notes, /release-notes/{postId} (08-core/08-community.md §3.11)
 *
 * - 위키 꼴 — 왼쪽에 릴리스 노트 목차(최신순), 오른쪽에 고른 노트의 본문. 머리와 바닥은 랜딩과 같다
 *   (2026-10-02 사용자 요청). 번호 없이 열면(/release-notes) 가장 최근 노트를 보여 준다
 * - 인증 없이 연다 — 랜딩 최근 릴리스·docs README 링크의 행선지, 게스트도 열람
 * - RELEASE_NOTE가 아니면(다른 게시판 post-id·없는 글) 404 COMMUNITY_POST_NOT_FOUND 안내
 * - 콘텐츠 언어 전환기 — availableLangs가 2개 이상일 때 노출. 기본은 UI 언어를 따르고
 *   전환기로 고르면 그 언어로 재조회(?lang=)한다. 요청 언어가 없으면 폴백 배지(서버가 en→ko 폴백)
 * - 본문은 lazy MarkdownViewer(toast-ui 전용 청크) 재사용
 */
import { Suspense, lazy, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Loader2 } from 'lucide-react'

import { isApiError } from '@/api/client'
import { PublicFooter, PublicHeader, publicPath } from '@/components/public-chrome'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicReleaseNote, usePublicReleaseNoteList } from '@/features/community/hooks'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDate } from '@/lib/format'
import { currentLanguage, type Language } from '@/lib/i18n'
import { summarizeMarkdown } from '@/lib/markdown'
import { resultCodeMessage } from '@/lib/result-code'
import { cn } from 'cn'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다(post-detail 관례)
const MarkdownViewer = lazy(() => import('@/features/community/components/markdown-viewer'))

export function ReleaseNoteViewerPage() {
  const { t } = useTranslation()
  const { postId: routePostId = '' } = useParams()
  // 목차 — 번호 없이 열면 가장 최근 노트를 고른다
  const toc = usePublicReleaseNoteList()
  const tocItems = toc.data?.items ?? []
  const postId = routePostId || tocItems[0]?.postId || ''
  // 번호도 없고 목차도 비었으면(또는 못 불러왔으면) 보여 줄 노트가 없다
  const nothingToShow = !routePostId && !toc.isPending && tocItems.length === 0
  // 콘텐츠 언어 — 전환기로 고르기 전엔 UI 언어를 따른다(언어 전환 시 함께 바뀐다)
  const [contentLangOverride, setContentLangOverride] = useState<Language | null>(null)
  const contentLang = contentLangOverride ?? currentLanguage()
  const note = usePublicReleaseNote(postId, contentLang)
  // 게시글 제목·본문 요약·canonical — 데이터 도착 전·오류에는 색인만 막는다
  usePageMeta(
    note.data
      ? {
          title: `${note.data.title} — ${t('common.appName')}`,
          description: summarizeMarkdown(note.data.content),
          canonicalPath: `/release-notes/${postId}`,
          ogType: 'article',
        }
      : { noindex: true },
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:flex-row md:gap-10">
        {/* 목차 — 넓은 화면에서는 왼쪽에 붙어 따라오고, 좁은 화면에서는 본문 위에 접힌 높이로 둔다 */}
        <nav
          aria-label={t('releaseNoteViewer.toc')}
          data-testid="release-note-toc"
          className="shrink-0 md:sticky md:top-6 md:max-h-[calc(100svh-3rem)] md:w-56 md:self-start md:overflow-y-auto"
        >
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
            {t('releaseNoteViewer.toc')}
            {tocItems.length > 0 ? (
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{tocItems.length}</span>
            ) : null}
          </h2>
          {toc.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <ul className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-md border p-1 md:max-h-none md:border-0 md:p-0">
              {tocItems.map((item) => (
                <li key={item.postId}>
                  <Link
                    to={publicPath(`/release-notes/${item.postId}`)}
                    aria-current={item.postId === postId ? 'page' : undefined}
                    className={cn(
                      'flex flex-col rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/60',
                      item.postId === postId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="break-words">{item.title}</span>
                    <span className="text-[11px] font-normal tabular-nums text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <main className="min-w-0 flex-1">
          {nothingToShow ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
              <p className="text-sm text-muted-foreground">{t('releaseNoteViewer.notFound')}</p>
              <Button asChild variant="outline" size="sm">
                <Link to={publicPath('/')}>
                  <Home aria-hidden />
                  {t('releaseNoteViewer.home')}
                </Link>
              </Button>
            </div>
          ) : note.isPending ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-4 py-24">
              <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          ) : note.isError || !note.data ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
              <p className="text-sm text-muted-foreground">
                {isApiError(note.error) && note.error.resultCode !== 'NETWORK_ERROR'
                  ? resultCodeMessage(note.error.resultCode)
                  : t('releaseNoteViewer.notFound')}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to={publicPath('/')}>
                  <Home aria-hidden />
                  {t('releaseNoteViewer.home')}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6 border-b pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-semibold">{note.data.title}</h1>
                  <Badge variant="secondary" className="text-[10px]">
                    {t('releaseNoteViewer.badge')}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.data.author.name} · {formatDate(note.data.createdAt)}
                </p>
              </div>
              {/* 콘텐츠 언어 전환기 — 여러 언어로 작성된 노트만 노출 */}
              {(note.data.availableLangs ?? []).length > 1 ? (
                <div
                  role="group"
                  aria-label={t('releaseNoteViewer.contentLanguage')}
                  className="mb-4 flex flex-wrap items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground">{t('releaseNoteViewer.contentLanguage')}</span>
                  <div className="flex flex-wrap gap-1">
                    {(note.data.availableLangs ?? []).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        aria-pressed={lang === contentLang}
                        onClick={() => setContentLangOverride(lang as Language)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          lang === contentLang
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t(`common.language.${lang}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* 폴백 배지 — 요청 언어 본문이 없어 다른 언어 원문으로 해석된 상태 */}
              {(note.data.availableLangs ?? []).indexOf(contentLang) < 0 ? (
                <p
                  data-testid="release-note-fallback"
                  className="mb-4 text-xs text-muted-foreground"
                  role="status"
                >
                  {t('releaseNoteViewer.fallbackNotice', { lang: t(`common.language.${contentLang}`) })}
                </p>
              ) : null}
              <article data-testid="release-note-detail" className="flex flex-col gap-4">
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <MarkdownViewer
                    key={contentLang}
                    markdown={note.data.content}
                    className="min-h-24"
                  />
                </Suspense>
              </article>
            </>
          )}
        </main>
      </div>
      <PublicFooter />
    </div>
  )
}
