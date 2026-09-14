/**
 * "DB에서 가져오기" 버튼 — ERD 탭 헤더 (ImportCrownButton과 같은 완결 패턴).
 * 리버스 다이얼로그를 내부에서 보유한다 — 데이터베이스 탭의 커넥션 행 액션과 같은 다이얼로그다.
 */
import { useState } from 'react'
import { Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ReverseDialog } from '@/features/connections/components/reverse-dialog'

export interface DatabaseImportButtonProps {
  workspaceId: string
}

export function DatabaseImportButton({ workspaceId }: DatabaseImportButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Database aria-hidden />
        {t('reverse.openButton')}
      </Button>
      <ReverseDialog open={open} onOpenChange={setOpen} workspaceId={workspaceId} />
    </>
  )
}
