/**
 * "템플릿으로 시작" 버튼 — ERD 탭 헤더 (SqlImportButton과 같은 완결 패턴).
 * 템플릿 갤러리 다이얼로그를 내부에서 보유한다 — 공개 템플릿을 골라 이 워크스페이스의
 * 새 문서로 복제하는 온보딩 경로 (08-core/09-templates.md §2.2).
 */
import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TemplateGalleryDialog } from '@/features/models/components/template-gallery-dialog'

export interface TemplateStartButtonProps {
  workspaceId: string
}

export function TemplateStartButton({ workspaceId }: TemplateStartButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LayoutTemplate aria-hidden />
        {t('model.templates.openButton')}
      </Button>
      <TemplateGalleryDialog open={open} onOpenChange={setOpen} workspaceId={workspaceId} />
    </>
  )
}
