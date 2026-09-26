/**
 * 빈 캔버스 시작 가이드 (05-editor/02-ui.md §2.1) — 편집 가능한 문서에 테이블이 0개일 때만.
 *
 * - 컨테이너는 pointer-events:none — 팬·줌은 그대로 통과시키고 카드만 클릭 가능하다.
 * - [첫 테이블 추가]는 우클릭 컨텍스트 메뉴의 createTable 경로(ErdCanvas §8.1)를 그대로 탄다 —
 *   위치는 현재 뷰포트 중심(flow 좌표). 테이블이 1개 생기면 호출부가 오버레이를 내린다.
 * - 읽기 전용(공개 뷰어·버전 뷰어)에는 렌더 자체를 하지 않는다(호출부 게이트).
 */
import { MousePointerClick, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export interface EmptyCanvasHintProps {
  /** [첫 테이블 추가] — ErdCanvas의 createTable 컨텍스트 액션 재사용(위치=뷰포트 중심) */
  onCreateFirstTable: () => void
}

export function EmptyCanvasHint({ onCreateFirstTable }: EmptyCanvasHintProps) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="empty-canvas-hint"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-lg border bg-background/95 p-6 text-center shadow-sm">
        <p className="font-medium">{t('model.editor.emptyCanvas.title')}</p>
        <p className="text-sm text-muted-foreground">{t('model.editor.emptyCanvas.description')}</p>
        <Button type="button" size="sm" onClick={onCreateFirstTable}>
          <Plus aria-hidden />
          {t('model.editor.emptyCanvas.createFirstTable')}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick aria-hidden className="size-3.5 shrink-0" />
          {t('model.editor.emptyCanvas.hint')}
        </p>
      </div>
    </div>
  )
}
