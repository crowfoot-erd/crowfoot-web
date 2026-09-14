/**
 * .crown 문서 파일 가져오기 (storyboard 02-user §5 — 문서 목록)
 *
 * 파일 선택 → 봉투 검증(crown-io) → 신규 문서 생성(메타 POST) → 본체 저장(content PUT) 2단계.
 * 항상 새 문서로 만든다 — 기존 문서에 덮어쓰지 않는다(실수 방지).
 */
import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/result-code'
import { saveModelContent } from '@/features/editor/api'
import { serializeContent } from '@/features/editor/model/content-io'
import { CrownParseError, parseCrownFile } from '@/features/editor/model/crown-io'
import { useCreateModel } from '@/features/models/hooks'

export function ImportCrownButton({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const createModel = useCreateModel(workspaceId)

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const crown = parseCrownFile(await file.text())
      const created = await createModel.mutateAsync({
        name: crown.model.name,
        description: crown.model.description ?? undefined,
        databaseType: crown.model.databaseType,
      })
      if (!created) throw new Error('no created model response')
      // 생성 응답의 version을 기준으로 본체를 저장한다(신규 생성이므로 충돌 여지 없음)
      await saveModelContent(workspaceId, created.modelId, {
        baseVersion: created.version,
        content: serializeContent(crown.content),
      })
      toast.success(t('model.import.successToast', { name: crown.model.name }))
    } catch (error) {
      toast.error(
        error instanceof CrownParseError ? t(`model.import.errors.${error.code}`) : errorMessage(error),
      )
    } finally {
      setBusy(false)
      // 같은 파일을 다시 골랐을 때도 change 이벤트가 오게
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
        {t('model.import.button')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".crown,application/json"
        className="hidden"
        aria-label={t('model.import.button')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
    </>
  )
}
