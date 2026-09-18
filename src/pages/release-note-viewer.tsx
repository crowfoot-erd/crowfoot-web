/**
 * 릴리스 노트 공개 뷰어 /release-notes/{postId} (08-core/08-community.md §3.11)
 *
 * - 인증 없이 연다 — 랜딩 최근 릴리스·docs README 링크의 행선지, 게스트도 열람
 * - RELEASE_NOTE가 아니면(다른 게시판 post-id·없는 글) 404 COMMUNITY_POST_NOT_FOUND 안내
 * - 본문은 lazy MarkdownViewer(toast-ui 전용 청크) 재사용 — 셸 없는 단독 화면
 */
import { Suspense, lazy } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Loader2 } from 'lucide-react'

import { isApiError } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicReleaseNote } from '@/features/community/hooks'
import { formatDate } from '@/lib/format'
import { resultCodeMessage } from '@/lib/result-code'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다(post-detail 관례)
const MarkdownViewer = lazy(() => import('@/features/community/components/markdown-viewer'))

export function ReleaseNoteViewerPage() {
  const { t } = useTranslation()
  const { postId = '' } = useParams()
  const note = usePublicReleaseNote(postId)

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
            <article data-testid="release-note-detail" className="flex flex-col gap-4">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <MarkdownViewer markdown={note.data.content} className="min-h-24" />
              </Suspense>
            </article>
          </main>
        </>
      )}
    </div>
  )
}
