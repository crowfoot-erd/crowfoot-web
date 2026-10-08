/**
 * 문서 정보 다이얼로그의 "만든 사이트" 칸 (08-core/19-site-showcase.md Section 6·3.1~3.4)
 *
 * - 주소(필수)·제목·설명(선택)을 넣고 저장하면 서버가 썸네일과 정보를 가져온다(최대 30초 — 진행 문구를 보인다)
 * - 저장한 값으로 입력 칸을 다시 채운다 — 고쳐서 다시 저장할 수 있다
 * - 같은 주소의 PUT(Section 3.2): 제목을 비우면 지금 제목을 둔다, 설명은 생략이면 유지·""이면 지운다 —
 *   그래서 설명은 저장된 값을 사용자가 직접 지웠을 때만 ""를 보낸다
 * - 다시 가져오기는 1분에 한 번(등록 때의 캡처도 센다 — 429 SITE_CAPTURE_TOO_SOON)
 * - 이름·설명 폼과 따로 저장한다(다이얼로그의 기존 저장 버튼과 엮지 않는다). 편집자 미만은 읽기만 한다
 */
import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, EyeOff, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isApiError } from '@/api/client'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { siteHost, type ModelSite, type ModelSiteBody } from '@/features/showcase/api'
import { SiteThumbnail } from '@/features/showcase/components/showcase-card'
import {
  useDeleteModelSite,
  useModelSite,
  useRecaptureModelSite,
  useSaveModelSite,
} from '@/features/showcase/hooks'
import { errorMessage, resultCodeMessage } from '@/lib/result-code'

/** 입력 상한 — 서버 검증(Section 3.2)과 같은 값 */
const URL_MAX = 2000
const TITLE_MAX = 200
const DESCRIPTION_MAX = 500

type SiteField = 'url' | 'title' | 'description'
type FieldErrors = Partial<Record<SiteField, string>>

export interface ModelSiteSectionProps {
  workspaceId: string
  modelId: string
  /** Editor 이상 — 아니면 등록된 사이트를 읽기만 한다 */
  canEdit?: boolean
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function ModelSiteSection({ workspaceId, modelId, canEdit = true }: ModelSiteSectionProps) {
  const { t } = useTranslation()
  const siteQuery = useModelSite(workspaceId, modelId)
  const saveMutation = useSaveModelSite(workspaceId, modelId)
  const recaptureMutation = useRecaptureModelSite(workspaceId, modelId)
  const deleteMutation = useDeleteModelSite(workspaceId, modelId)
  const site = siteQuery.data ?? null

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 저장된 값으로 입력 칸을 채운다 — 처음 불러올 때, 저장·다시 가져오기·삭제 뒤
  useEffect(() => {
    setUrl(site?.url ?? '')
    setTitle(site?.title ?? '')
    setDescription(site?.description ?? '')
    setFieldErrors({})
  }, [site])

  const busy = saveMutation.isPending || recaptureMutation.isPending || deleteMutation.isPending

  const handleSave = (event: FormEvent) => {
    event.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl || trimmedUrl.length > URL_MAX || !isHttpUrl(trimmedUrl)) {
      setFieldErrors({ url: t('model.site.urlInvalid') })
      return
    }
    setFieldErrors({})
    const body: ModelSiteBody = { url: trimmedUrl }
    if (title.trim()) body.title = title.trim()
    if (description.trim()) body.description = description.trim()
    else if (site?.description) body.description = '' // 저장된 설명을 직접 지웠다 — 명시적 클리어
    saveMutation.mutate(body, {
      onSuccess: (saved) => {
        toast.success(saved?.captureError ? t('model.site.savedWithErrorToast') : t('model.site.savedToast'))
      },
      onError: (error) => {
        if (isApiError(error) && error.resultCode === 'SITE_URL_BLOCKED') {
          setFieldErrors({ url: resultCodeMessage('SITE_URL_BLOCKED') })
          return
        }
        if (isApiError(error) && error.resultCode === 'INVALID_REQUEST' && error.errors?.length) {
          // 서버가 짚은 칸에 붙인다 — 모르는 칸이면 주소 칸에 둔다
          const next: FieldErrors = {}
          for (const item of error.errors) {
            const field: SiteField = item.field === 'title' || item.field === 'description' ? item.field : 'url'
            next[field] = t(`model.site.invalid.${field}`)
          }
          setFieldErrors(next)
          return
        }
        toast.error(errorMessage(error))
      },
    })
  }

  const handleRecapture = () => {
    recaptureMutation.mutate(undefined, {
      onSuccess: (saved) => {
        if (saved?.captureError) toast.error(t('model.site.recaptureFailedToast'))
        else toast.success(t('model.site.recapturedToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        setConfirmDelete(false)
        toast.success(t('model.site.deletedToast'))
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <section aria-labelledby="model-site-heading" className="grid gap-3 border-t pt-4" data-testid="model-site-section">
      <div>
        <h3 id="model-site-heading" className="text-sm font-semibold">
          {t('model.site.heading')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('model.site.notice')}</p>
      </div>

      {siteQuery.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : siteQuery.isError ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {errorMessage(siteQuery.error)}
        </p>
      ) : (
        <>
          {site ? <SitePreview site={site} /> : null}

          {canEdit ? (
            <form onSubmit={handleSave} className="grid gap-3" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="model-site-url">{t('model.site.url')}</Label>
                <Input
                  id="model-site-url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://"
                  maxLength={URL_MAX}
                  aria-invalid={fieldErrors.url ? true : undefined}
                  aria-describedby={fieldErrors.url ? 'model-site-url-error' : undefined}
                  disabled={busy}
                />
                {fieldErrors.url ? (
                  <p id="model-site-url-error" className="text-xs text-destructive" role="alert">
                    {fieldErrors.url}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model-site-title">{t('model.site.title')}</Label>
                <Input
                  id="model-site-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('model.site.titlePlaceholder')}
                  maxLength={TITLE_MAX}
                  aria-invalid={fieldErrors.title ? true : undefined}
                  disabled={busy}
                />
                {fieldErrors.title ? (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.title}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model-site-description">{t('model.site.description')}</Label>
                <Textarea
                  id="model-site-description"
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('model.site.descriptionPlaceholder')}
                  maxLength={DESCRIPTION_MAX}
                  aria-invalid={fieldErrors.description ? true : undefined}
                  disabled={busy}
                />
                {fieldErrors.description ? (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.description}
                  </p>
                ) : null}
              </div>

              {saveMutation.isPending ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  {t('model.site.capturing')}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {site ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={handleRecapture} disabled={busy}>
                      {recaptureMutation.isPending ? (
                        <Loader2 aria-hidden className="animate-spin" />
                      ) : (
                        <RefreshCw aria-hidden />
                      )}
                      {t('model.site.recapture')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setConfirmDelete(true)}
                      disabled={busy}
                    >
                      <Trash2 aria-hidden />
                      {t('model.site.delete')}
                    </Button>
                  </>
                ) : null}
                <Button type="submit" size="sm" className="ml-auto" disabled={busy || !url.trim()}>
                  {saveMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  {t('model.site.save')}
                </Button>
              </div>
            </form>
          ) : site ? null : (
            <p className="text-sm text-muted-foreground">{t('model.site.empty')}</p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('model.site.deleteConfirm.title')}
        description={t('model.site.deleteConfirm.description')}
        confirmLabel={t('model.site.delete')}
        destructive
        onConfirm={handleDelete}
        confirming={deleteMutation.isPending}
      />
    </section>
  )
}

/** 저장된 사이트 미리 보기 — 썸네일·파비콘·이름·제목·설명과 캡처 실패 사유 */
function SitePreview({ site }: { site: ModelSite }) {
  const { t } = useTranslation()
  const host = siteHost(site.url)
  return (
    <div className="grid gap-2" data-testid="model-site-preview">
      <div className="flex gap-3">
        <SiteThumbnail
          // 다시 찍으면 v가 바뀐다 — 주소로 다시 그려 실패 상태를 초기화한다
          key={site.thumbnailUrl ?? 'none'}
          thumbnailUrl={site.thumbnailUrl}
          faviconUrl={site.faviconUrl}
          name={site.siteName || host}
          className="w-36 shrink-0"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {site.faviconUrl ? <img src={site.faviconUrl} alt="" className="size-4 rounded-sm" /> : null}
            <span className="truncate">{site.siteName || host}</span>
          </span>
          <span className="break-words text-sm font-medium">{site.title}</span>
          {site.description ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">{site.description}</span>
          ) : null}
          {site.hidden ? (
            <Badge variant="destructive" className="w-fit">
              <EyeOff aria-hidden />
              {t('model.site.hidden')}
            </Badge>
          ) : null}
        </div>
      </div>
      {site.captureError ? (
        <Alert variant="destructive" data-testid="model-site-capture-error">
          <AlertTriangle aria-hidden />
          <AlertDescription>{t('model.site.captureError', { reason: site.captureError })}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
