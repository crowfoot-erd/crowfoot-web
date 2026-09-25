/**
 * 릴리스 노트 공개 뷰어 /release-notes/{postId} (08-core/08-community.md §3.11)
 *
 * - 인증 없이 연다 — 랜딩 최근 릴리스·docs README 링크의 행선지, 게스트도 열람
 * - RELEASE_NOTE가 아니면(다른 게시판 post-id·없는 글) 404 COMMUNITY_POST_NOT_FOUND 안내
 * - 콘텐츠 언어 전환기 — availableLangs가 2개 이상일 때 노출. 기본은 UI 언어를 따르고
 *   전환기로 고르면 그 언어로 재조회(?lang=)한다. 요청 언어가 없으면 폴백 배지(서버가 en→ko 폴백)
 * - 본문은 lazy MarkdownViewer(toast-ui 전용 청크) 재사용 — 셸 없는 단독 화면
 */
import { Suspense, lazy, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Loader2 } from 'lucide-react'

import { isApiError } from '@/api/client'
import { LanguageSelect } from '@/components/language-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicReleaseNote } from '@/features/community/hooks'
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
  const { postId = '' } = useParams()
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
    <div className="flex h-dvh flex-col bg-background">
      {note.isPending ? (
        // 공개 노트 조회 — 전체 화면 중앙 스피너(share-viewer 관례)
        <div
          role="status"
          aria-live="polite"
          className="flex flex-1 flex-col items-center justify-center gap-4"
        >
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      ) : note.isError || !note.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isApiError(note.error) && note.error.resultCode !== 'NETWORK_ERROR'
              ? resultCodeMessage(note.error.resultCode)
              : t('releaseNoteViewer.notFound')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t('releaseNoteViewer.home')}</Link>
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold">{note.data.title}</h1>
                <Badge variant="secondary" className="text-[10px]">
                  {t('releaseNoteViewer.badge')}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {note.data.author.name} · {formatDate(note.data.createdAt)}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <Home aria-hidden />
                {t('releaseNoteViewer.home')}
              </Link>
            </Button>
          </header>
          <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8">
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
          </main>
        </>
      )}

      {/* 우하단 고정 — 언어(terms 관례) */}
      <div className="fixed bottom-4 right-4 flex items-center gap-1">
        <LanguageSelect />
      </div>
    </div>
  )
}
