/**
 * 커뮤니티 게시글 작성·수정 폼 (08-core/08-community.md) — CommunityPostFormPage({mode})
 *
 * - 제목은 react-hook-form + zod, 본문은 lazy MarkdownEditor(비제어 — onChange로만 수집)
 * - 수정 모드는 게시글 로드 완료 후 폼을 마운트한다(에디터 initialValue는 로드된 본문으로 1회 주입)
 * - RELEASE_NOTE 작성은 관리자 전용 — 게시판 목록이 버튼을 감추고 서버가 최종 판정한다
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import { useMe } from '@/features/auth'
import { useCommunityPost, useCreateCommunityPost, useUpdateCommunityPost } from '@/features/community'
import { errorMessage } from '@/lib/result-code'
import type { CommunityBoard } from '@/api/types'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다
const MarkdownEditor = lazy(() => import('@/features/community/components/markdown-editor'))

type PostFormValues = { title: string }

interface CommunityPostFormPageProps {
  mode: 'create' | 'edit'
}

function parseBoard(value: string | null): CommunityBoard {
  return value === 'RELEASE_NOTE' ? 'RELEASE_NOTE' : 'FEEDBACK'
}

export function CommunityPostFormPage({ mode }: CommunityPostFormPageProps) {
  const { t } = useTranslation()
  const me = useMe()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { postId = '' } = useParams()
  const editing = mode === 'edit'

  const board = parseBoard(searchParams.get('board'))
  const existing = useCommunityPost(editing ? postId : '')
  const createPost = useCreateCommunityPost()
  const updatePost = useUpdateCommunityPost()

  const [content, setContent] = useState('')
  const [contentTouched, setContentTouched] = useState(false)

  const schema = z.object({
    title: z.string().trim().min(1, t('community.form.titleRequired')).max(200, t('community.form.titleRequired')),
  })
  const form = useForm<PostFormValues>({ resolver: zodResolver(schema), defaultValues: { title: '' } })

  // 수정 모드 시드 — 로드된 제목을 폼에 반영(본문 initialValue는 렌더 시점 값)
  useEffect(() => {
    if (existing.data) {
      form.reset({ title: existing.data.title })
    }
  }, [existing.data, form])

  const pending = createPost.isPending || updatePost.isPending
  const contentInvalid = contentTouched && content.trim().length === 0

  // 수정 대상 권한 — 작성자 본인 또는 관리자(서버가 최종 판정). 위반 시 읽기 화면으로.
  // me 로드 전(me.data == null)에는 판정하지 않는다 — 로딩 순서로 작성자가 쫓겨나는 레이스 방지
  const editForbidden =
    editing &&
    existing.data != null &&
    me.data != null &&
    me.data.userId !== existing.data.author.userId &&
    me.data.admin !== true
  if (editForbidden) {
    return <Navigate to={`/community/posts/${postId}`} replace />
  }

  const submit = form.handleSubmit((values) => {
    setContentTouched(true)
    if (content.trim().length === 0) return

    const onError = (error: unknown) => toast.error(errorMessage(error))
    if (editing) {
      updatePost.mutate(
        { postId, body: { title: values.title, content } },
        {
          onSuccess: (updated) => {
            if (!updated) return
            toast.success(t('community.form.updatedToast'))
            navigate(`/community/posts/${updated.postId}`)
          },
          onError,
        },
      )
    } else {
      createPost.mutate(
        { board, title: values.title, content },
        {
          onSuccess: (created) => {
            if (!created) return
            toast.success(t('community.form.createdToast'))
            navigate(`/community/posts/${created.postId}`)
          },
          onError,
        },
      )
    }
  })

  if (editing) {
    if (existing.isPending) {
      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )
    }
    if (existing.isError || !existing.data) {
      return <ErrorState onRetry={() => void existing.refetch()} />
    }
  }

  const backTo = editing
    ? `/community/posts/${postId}`
    : board === 'RELEASE_NOTE'
      ? '/community/release-notes'
      : '/community/feedback'

  return (
    <div className="flex flex-col gap-4" data-testid="community-post-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {editing ? t('community.form.editTitle') : t('community.form.createTitle')}
        </h1>
        <Button type="button" variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link to={backTo}>{t('common.cancel')}</Link>
        </Button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="community-post-title" className="text-sm font-medium">
            {t('community.form.titleLabel')}
          </label>
          <Input
            id="community-post-title"
            type="text"
            maxLength={200}
            placeholder={t('community.form.titlePlaceholder')}
            {...form.register('title')}
            aria-invalid={form.formState.errors.title != null}
          />
          {form.formState.errors.title ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.title.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('community.form.contentLabel')}</span>
          <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
            <MarkdownEditor
              key={editing ? postId : board}
              initialValue={editing ? (existing.data?.content ?? '') : ''}
              onChange={(markdown) => {
                setContent(markdown)
                setContentTouched(true)
              }}
            />
          </Suspense>
          {contentInvalid ? (
            <p className="text-sm text-destructive" role="alert">
              {t('community.form.contentRequired')}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {editing ? t('community.form.submitEdit') : t('community.form.submitCreate')}
          </Button>
        </div>
      </form>
    </div>
  )
}
