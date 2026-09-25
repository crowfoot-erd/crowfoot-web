/**
 * 커뮤니티 게시글 작성·수정 폼 (08-core/08-community.md) — CommunityPostFormPage({mode})
 *
 * - FEEDBACK은 단일 언어 폼 — react-hook-form + zod, 본문은 lazy MarkdownEditor(비제어 — onChange로만 수집)
 * - RELEASE_NOTE는 4언어 탭 폼 — 언어별 제목·본문을 편집해 값 있는 언어만 객체로 전송(§2.1 쓰기 다형)
 * - 수정 모드는 게시글 로드 완료 후 폼을 마운트한다(에디터 initialValue는 로드된 본문으로 1회 주입)
 * - RELEASE_NOTE 수정은 4언어를 병렬 조회해 시드 — availableLangs(제목 기준)에 없는 언어는 빈 값으로
 *   시작한다(서버 폴백 원문이 빈 언어로 오염 저장되는 것 방지), 해당 탭에는 미작성 배지
 * - RELEASE_NOTE 작성은 관리자 전용 — 게시판 목록이 버튼을 감추고 서버가 최종 판정한다
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorState } from '@/components/error-state'
import { useMe } from '@/features/auth'
import { useCommunityPost, useCreateCommunityPost, useUpdateCommunityPost } from '@/features/community'
import type { LocalizedTextInput } from '@/features/community/api'
import { errorMessage } from '@/lib/result-code'
import { INTL_LOCALES, SUPPORTED_LANGUAGES, currentLanguage, type Language } from '@/lib/i18n'
import type { CommunityBoard } from '@/api/types'

// toast-ui 청크 분리 — 메인 번들에 포함하지 않는다
const MarkdownEditor = lazy(() => import('@/features/community/components/markdown-editor'))

/** 언어별 초안 — 4칸 항상 존재, 전송 시 값 있는 언어만 pick */
type LocalizedDraft = Record<Language, string>

const EMPTY_DRAFT: LocalizedDraft = { ko: '', en: '', ja: '', zh: '' }

/** trim 후 값 있는 언어만 담은 전송용 객체 — 빈 언어는 서버가 유지(병합)한다 */
function pickLocalized(draft: LocalizedDraft): LocalizedTextInput {
  const picked: LocalizedTextInput = {}
  for (const lang of SUPPORTED_LANGUAGES) {
    const value = draft[lang].trim()
    if (value.length > 0) picked[lang] = value
  }
  return picked
}

function filledLangs(draft: LocalizedDraft): Language[] {
  return SUPPORTED_LANGUAGES.filter((lang) => draft[lang].trim().length > 0)
}

interface CommunityPostFormPageProps {
  mode: 'create' | 'edit'
}

function parseBoard(value: string | null): CommunityBoard {
  return value === 'RELEASE_NOTE' ? 'RELEASE_NOTE' : 'FEEDBACK'
}

export function CommunityPostFormPage({ mode }: CommunityPostFormPageProps) {
  const me = useMe()
  const [searchParams] = useSearchParams()
  const { postId = '' } = useParams()
  const editing = mode === 'edit'

  // 수정 원문은 ko로 통일 조회 — 작성자가 쓴 기준 언어로 board·availableLangs·시드를 판정한다
  const existing = useCommunityPost(editing ? postId : '', 'ko')
  // 생성은 쿼리 파라미터로, 수정은 로드된 글로 확정
  const board: CommunityBoard | null = editing ? (existing.data?.board ?? null) : parseBoard(searchParams.get('board'))
  // 릴리스 노트 수정은 나머지 3개 언어를 병렬 조회해 탭을 시드한다
  const releaseEdit = editing && board === 'RELEASE_NOTE'
  const enPost = useCommunityPost(releaseEdit ? postId : '', 'en')
  const jaPost = useCommunityPost(releaseEdit ? postId : '', 'ja')
  const zhPost = useCommunityPost(releaseEdit ? postId : '', 'zh')

  const [seed, setSeed] = useState<{ titles: LocalizedDraft; contents: LocalizedDraft } | null>(null)

  // 릴리스 노트 수정 시드 — 4개 언어 조회가 전부 도착한 뒤 1회.
  // availableLangs는 제목 기준이므로 제목에 없는 언어의 본문은 서버 폴백 원문일 수 있다 — 마찬가지로 비운다
  useEffect(() => {
    if (!releaseEdit || seed) return
    const ko = existing.data
    const en = enPost.data
    const ja = jaPost.data
    const zh = zhPost.data
    if (!ko || !en || !ja || !zh) return
    const available = new Set(ko.availableLangs ?? ['ko'])
    const titles: LocalizedDraft = { ...EMPTY_DRAFT }
    const contents: LocalizedDraft = { ...EMPTY_DRAFT }
    const byLang = { ko, en, ja, zh }
    for (const lang of SUPPORTED_LANGUAGES) {
      if (!available.has(lang)) continue
      titles[lang] = byLang[lang].title
      contents[lang] = byLang[lang].content
    }
    setSeed({ titles, contents })
  }, [releaseEdit, seed, existing.data, enPost.data, jaPost.data, zhPost.data])

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

  if (board === 'RELEASE_NOTE') {
    // 생성은 빈 초안, 수정은 시드 완료 후 마운트(에디터 initialValue 1회 주입 계약)
    if (editing && !seed) {
      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )
    }
    const titles = editing && seed ? seed.titles : EMPTY_DRAFT
    const contents = editing && seed ? seed.contents : EMPTY_DRAFT
    // 미작성 배지는 수정 대상에만 — 생성은 전부 새로 쓰는 초안이라 배지가 무의미하다
    const untranslated = editing
      ? SUPPORTED_LANGUAGES.filter((lang) => filledLangs(titles).indexOf(lang) < 0)
      : []
    return (
      <ReleaseNoteForm
        mode={mode}
        postId={postId}
        backTo={backTo}
        initialTitles={titles}
        initialContents={contents}
        untranslated={untranslated}
      />
    )
  }

  if (board === null) {
    return null // 수정 게시글 board 확정 전 — 위 스켈레톤이 이미 막고 있어 도달하지 않는다
  }

  return (
    <FeedbackPostForm
      mode={mode}
      postId={postId}
      backTo={backTo}
      initialTitle={existing.data?.title ?? ''}
      initialContent={existing.data?.content ?? ''}
    />
  )
}

/* ---------- FEEDBACK 단일 언어 폼 — 기존 계약 그대로(title/content 문자열 전송) ---------- */

type PostFormValues = { title: string }

interface FeedbackPostFormProps {
  mode: 'create' | 'edit'
  postId: string
  backTo: string
  initialTitle: string
  initialContent: string
}

function FeedbackPostForm({ mode, postId, backTo, initialTitle, initialContent }: FeedbackPostFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const editing = mode === 'edit'
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
    form.reset({ title: initialTitle })
  }, [initialTitle, form])

  const pending = createPost.isPending || updatePost.isPending
  const contentInvalid = contentTouched && content.trim().length === 0

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
        { board: 'FEEDBACK', title: values.title, content },
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
              key={editing ? postId : 'feedback'}
              initialValue={initialContent}
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

/* ---------- RELEASE_NOTE 4언어 탭 폼 — 값 있는 언어만 객체로 전송 ---------- */

interface ReleaseNoteFormProps {
  mode: 'create' | 'edit'
  postId: string
  backTo: string
  initialTitles: LocalizedDraft
  initialContents: LocalizedDraft
  /** 수정 대상에서 아직 작성되지 않은 언어 — 탭에 미작성 배지 */
  untranslated: Language[]
}

function ReleaseNoteForm({ mode, postId, backTo, initialTitles, initialContents, untranslated }: ReleaseNoteFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const editing = mode === 'edit'
  const createPost = useCreateCommunityPost()
  const updatePost = useUpdateCommunityPost()

  const [titles, setTitles] = useState<LocalizedDraft>(initialTitles)
  const [contents, setContents] = useState<LocalizedDraft>(initialContents)
  const [attempted, setAttempted] = useState(false)

  // 첫 탭 — 현재 UI 언어가 작성돼 있으면 그 언어, 아니면 첫 작성 언어(생성은 현재 언어)
  const initialTab: Language = (() => {
    const ui = currentLanguage()
    if (!untranslated.includes(ui)) return ui
    const first = SUPPORTED_LANGUAGES.find((lang) => !untranslated.includes(lang))
    return first ?? 'ko'
  })()
  const [activeTab, setActiveTab] = useState<Language>(initialTab)

  const pending = createPost.isPending || updatePost.isPending
  const titleFilled = filledLangs(titles)
  const contentFilled = filledLangs(contents)
  const titleInvalid = attempted && titleFilled.length === 0
  const contentInvalid = attempted && contentFilled.length === 0

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (titleFilled.length === 0 || contentFilled.length === 0) return

    const onError = (error: unknown) => toast.error(errorMessage(error))
    if (editing) {
      updatePost.mutate(
        { postId, body: { title: pickLocalized(titles), content: pickLocalized(contents) } },
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
        { board: 'RELEASE_NOTE', title: pickLocalized(titles), content: pickLocalized(contents) },
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
  }

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
        {/* 언어 탭 — 비활성 탭은 unmount(Radix 기본)라 에디터는 활성 언어만 살아 있다.
            초안은 이 컴포넌트 state에 있어 탭 전환으로 입력이 유실되지 않는다 */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Language)}>
          <TabsList>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TabsTrigger key={lang} value={lang}>
                {t(`common.language.${lang}`)}
                {untranslated.includes(lang) ? (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {t('community.form.untranslated')}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {SUPPORTED_LANGUAGES.map((lang) => (
            <TabsContent key={lang} value={lang} className="mt-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor={`community-post-title-${lang}`} className="text-sm font-medium">
                    {t('community.form.titleLabel')}
                  </label>
                  <Input
                    id={`community-post-title-${lang}`}
                    type="text"
                    maxLength={200}
                    placeholder={t('community.form.titlePlaceholder')}
                    value={titles[lang]}
                    onChange={(event) =>
                      setTitles((prev) => ({ ...prev, [lang]: event.target.value }))
                    }
                    aria-invalid={titleInvalid}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{t('community.form.contentLabel')}</span>
                  <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
                    {/* 탭 전환 = remount — initialValue에 저장 초안을 되살리고 에디터 UI 문구도
                        해당 언어 로케일로 뜬다(마운트 시 1회 고정 계약과 정합) */}
                    <MarkdownEditor
                      key={lang}
                      initialValue={contents[lang]}
                      language={INTL_LOCALES[lang]}
                      onChange={(markdown) => setContents((prev) => ({ ...prev, [lang]: markdown }))}
                    />
                  </Suspense>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {titleInvalid ? (
          <p className="text-sm text-destructive" role="alert">
            {t('community.form.titleRequiredOne')}
          </p>
        ) : null}
        {contentInvalid ? (
          <p className="text-sm text-destructive" role="alert">
            {t('community.form.contentRequiredOne')}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {editing ? t('community.form.submitEdit') : t('community.form.submitCreate')}
          </Button>
        </div>
      </form>
    </div>
  )
}
