/**
 * 용어 대량 등록 다이얼로그 (용어 사전 패널 — v1.14)
 *
 * "토큰,라벨"/탭 붙여넣기를 parseTermBulkParse로 즉시 파싱해 미리보기(등록 N건 ·
 * 형식 오류 M건)를 보여주고, 실행하면 useBulkUpsertTerms가 줄 단위로 순차 등록한다.
 * 결과는 성공 요약 + 실패 줄 목록(줄 번호·토큰·에러 문구) — 한 줄 실패가 나머지를
 * 멈추지 않는다. 본문은 다이얼로그가 열려 있을 때만 마운트된다(폼 상태가 열림에만 산다).
 */
import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parseTermBulkText, type TermBulkIssueReason } from '@/features/editor/model/term-bulk-parse'
import { useBulkUpsertTerms, type BulkUpsertOutcome } from '@/features/terms/hooks'

export interface TermBulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

const ISSUE_KEYS: Record<TermBulkIssueReason, string> = {
  missingSeparator: 'model.editor.termDictionary.bulkIssueMissingSeparator',
  emptyLabel: 'model.editor.termDictionary.bulkIssueEmptyLabel',
  spaceInTerm: 'model.editor.termDictionary.bulkIssueSpaceInTerm',
}

export function TermBulkImportDialog({ open, onOpenChange, workspaceId }: TermBulkImportDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('model.editor.termDictionary.bulkTitle')}</DialogTitle>
          <DialogDescription>{t('model.editor.termDictionary.bulkDescription')}</DialogDescription>
        </DialogHeader>
        {open ? <BulkImportBody workspaceId={workspaceId} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function BulkImportBody({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = useState<BulkUpsertOutcome | null>(null)
  const bulk = useBulkUpsertTerms(workspaceId)

  const parsed = useMemo(() => parseTermBulkText(text), [text])
  const running = bulk.isPending || progress !== null

  const run = () => {
    setOutcome(null)
    setProgress({ done: 0, total: parsed.entries.length })
    bulk.mutate(
      {
        entries: parsed.entries,
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onSuccess: (result) => setOutcome(result),
        // 네트워크 실패 등 뮤테이션 자체가 터진 경우 — 줄 단위 실패는 outcome으로 간다
        onError: () => setProgress(null),
        onSettled: () => setProgress(null),
      },
    )
  }

  return (
    <div className="grid gap-3">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('model.editor.termDictionary.bulkPlaceholder')}
        aria-label={t('model.editor.termDictionary.bulkTitle')}
        rows={6}
        className="min-h-28 font-mono text-xs"
        disabled={running}
        data-testid="term-bulk-textarea"
      />

      {/* 파싱 미리보기 — 입력마다 즉시 계산(순수 모듈). 오류 줄은 실행 전에 보여준다 */}
      {text.trim() !== '' ? (
        <div className="grid gap-1 text-xs" data-testid="term-bulk-preview">
          {parsed.entries.length > 0 ? (
            <p>
              {t('model.editor.termDictionary.bulkParsed', {
                count: parsed.entries.length,
                issues: parsed.issues.length,
              })}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t('model.editor.termDictionary.bulkNoEntries')}
            </p>
          )}
          {parsed.issues.length > 0 ? (
            <ul className="grid max-h-20 gap-0.5 overflow-y-auto text-muted-foreground">
              {parsed.issues.map((issue) => (
                <li key={issue.line}>
                  L{issue.line} — {t(ISSUE_KEYS[issue.reason])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* 결과 요약 — 성공 N · 실패 목록(줄 번호·토큰·에러 문구) */}
      {outcome ? (
        <div data-testid="term-bulk-result" className="grid gap-1 rounded-md border p-2 text-xs">
          <p className="font-medium">
            {t('model.editor.termDictionary.bulkResult', {
              success: outcome.succeeded.length,
              failed: outcome.failed.length,
            })}
          </p>
          {outcome.failed.length > 0 ? (
            <ul className="grid max-h-20 gap-0.5 overflow-y-auto text-muted-foreground">
              {outcome.failed.map((row) => (
                <li key={row.line}>
                  L{row.line} {row.term} — {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          size="sm"
          onClick={run}
          disabled={running || parsed.entries.length === 0}
          data-testid="term-bulk-run"
        >
          {running ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
          {running && progress
            ? t('model.editor.termDictionary.bulkRunning', {
                done: progress.done,
                total: progress.total,
              })
            : t('model.editor.termDictionary.bulkRun', { count: parsed.entries.length })}
        </Button>
      </DialogFooter>
    </div>
  )
}
