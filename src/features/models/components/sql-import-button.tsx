/**
 * "SQL 가져오기" 버튼 — ERD 탭 헤더 4번째 (DatabaseImportButton과 같은 완결 패턴).
 * SQL Import 다이얼로그를 내부에서 보유한다 — DDL 텍스트로 문서를 만드는 온보딩 경로.
 */
import { useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { SqlImportDialog } from '@/features/models/components/sql-import-dialog'

export interface SqlImportButtonProps {
  workspaceId: string
}

export function SqlImportButton({ workspaceId }: SqlImportButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileCode2 aria-hidden />
        {t('sqlImport.openButton')}
      </Button>
      <SqlImportDialog open={open} onOpenChange={setOpen} workspaceId={workspaceId} />
    </>
  )
}
