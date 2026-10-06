/**
 * 데이터 보기 구조 탭의 문서와 다른 점 (05-editor/02-ui.md §22, 09-database-manager/00-data-browser.md §5.10)
 *
 * - [문서와 비교]를 누르면 원천 커넥션의 스키마를 한 번 읽어 둔다. 비교는 DB 동기화(SyncDialog)와 같은 diffSync다
 * - 읽어 둔 스키마와 화면의 문서(저장 전 편집까지)를 그때그때 비교한다 — 문서를 고치면 목록도 바로 바뀐다
 * - 보여 주는 것은 고른 테이블의 항목뿐이다. 관계는 자식 테이블에 붙는다
 * - [문서로 가져오기]는 DB 동기화 다이얼로그를, [DB에 반영]은 마이그레이션 DDL 다이얼로그를 연다(도구 메뉴와 같다)
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, GitCompareArrows, Loader2, RefreshCw, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useConnectionSchema } from '@/features/connections/hooks'
import { parseContent } from '@/features/editor/model/content-io'
import type { EditorDocument } from '@/features/editor/model/content-schema'
import { diffSync } from '@/features/editor/model/sync-merge'
import { useDataView } from '@/features/editor/store/data-view-store'
import { useEditorStore } from '@/features/editor/store/editor-store'
import { errorMessage } from '@/lib/result-code'
import { ActionMarker } from './SyncDialog'

export function DataViewDocumentDiff({
  workspaceId,
  sourceConnectionId,
  objectName,
}: {
  workspaceId: string
  sourceConnectionId: string
  objectName: string
}) {
  const { t } = useTranslation()
  const schema = useConnectionSchema(workspaceId)
  const present = useEditorStore((state) => state.present)
  const requestTool = useDataView((state) => state.requestTool)
  /** 읽어 둔 DB 스키마 — 테이블을 옮겨도 다시 읽지 않는다 */
  const [db, setDb] = useState<EditorDocument | null>(null)

  const items = useMemo(() => {
    if (!db) return null
    const key = objectName.trim().toLowerCase()
    return diffSync(present, db).summary.items.filter(
      (item) => item.table.trim().toLowerCase() === key,
    )
  }, [db, present, objectName])

  const compare = async () => {
    try {
      const result = await schema.mutateAsync(sourceConnectionId)
      if (!result) return
      const parsed = parseContent(result.content)
      setDb({ model: parsed.model, diagram: parsed.diagram })
    } catch {
      // 오류 표시는 mutation 상태(isError)로 한다
    }
  }

  return (
    <section
      aria-label={t('database.compare.title')}
      data-testid="data-view-document-diff"
      className="grid gap-2 rounded-md border bg-muted/20 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{t('database.compare.title')}</h3>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void compare()}
          disabled={schema.isPending}
        >
          {schema.isPending ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : db ? (
            <RefreshCw aria-hidden />
          ) : (
            <GitCompareArrows aria-hidden />
          )}
          {db ? t('database.compare.again') : t('database.compare.run')}
        </Button>
      </div>

      {schema.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(schema.error)}
        </p>
      ) : items === null ? (
        <p className="text-xs text-muted-foreground">{t('database.compare.hint')}</p>
      ) : items.length === 0 ? (
        <p
          className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
          data-testid="compare-same"
        >
          <CheckCircle2 aria-hidden className="size-3.5" />
          {t('database.compare.same')}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('database.compare.legend')}</p>
          <ul
            data-testid="compare-items"
            className="grid gap-0.5 rounded-md border bg-background py-1"
          >
            {items.map((item, index) => (
              <li key={index} className="flex items-baseline gap-1.5 px-3 py-0.5 text-xs">
                <ActionMarker action={item.action} />
                <span className="shrink-0">
                  {t(`database.compare.item.${item.action}`, {
                    kind: t(`model.editor.sync.kind.${item.kind}`),
                  })}
                </span>
                <span className="truncate font-mono">{item.name}</span>
                {item.action === 'update' && item.detail ? (
                  <span className="truncate text-muted-foreground">— {item.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => requestTool('sync')}>
              <Download aria-hidden />
              {t('database.compare.toDocument')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => requestTool('migration')}
            >
              <Upload aria-hidden />
              {t('database.compare.toDatabase')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
