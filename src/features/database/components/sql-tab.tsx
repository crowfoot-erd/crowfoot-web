/**
 * SQL 탭 — 직접 쓴 SQL 한 문장을 실행하고 결과를 본다 (09-database-manager/00-data-browser.md §5.3)
 *
 * - 입력 칸에 문장이 여러 개 있으면 커서가 놓인 문장만 보낸다. 글자를 선택했으면 선택한 부분만 보낸다
 * - 읽기 문장은 바로 실행한다. 쓰기·구조 문장은 서버가 CONFIRMATION_REQUIRED로 돌려보내고,
 *   확인 다이얼로그를 거쳐 다시 보낸다
 * - 실행 이력은 이 브라우저에만 남는다. 서버에는 SQL 본문을 저장하지 않는다
 */
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, Download, History, Loader2, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { QueryResult, StatementKind } from '@/features/database/api'
import { ResultTable, toCsv } from '@/features/database/components/result-table'
import { databaseErrorMessage } from '@/features/database/errors'
import { databaseKeys, useRunQuery } from '@/features/database/hooks'
import { pushSqlHistory, readSqlHistory, type SqlHistoryEntry } from '@/features/database/sql-history'
import { statementToRun } from '@/features/database/sql-statements'
import { downloadTextFile } from '@/lib/download'
import { formatDateTime, formatNumber } from '@/lib/format'

export interface SqlTabProps {
  workspaceId: string
  connectionId: string
  connectionName: string
  /** database_types 코드 — 문장 경계 규칙(따옴표·주석)이 DBMS마다 다르다 */
  dbmsType: string
}

export function SqlTab({ workspaceId, connectionId, connectionName, dbmsType }: SqlTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const run = useRunQuery(workspaceId, connectionId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  /** 확인을 기다리는 문장 — 서버가 CONFIRMATION_REQUIRED로 돌려보낸 것 */
  const [pending, setPending] = useState<{ sql: string; kind: StatementKind } | null>(null)
  const [history, setHistory] = useState<SqlHistoryEntry[]>(() => readSqlHistory(connectionId))
  const [historyOpen, setHistoryOpen] = useState(false)

  const execute = (statement: string, confirmed: boolean) => {
    setRequestError(null)
    run.mutate(
      { sql: statement, confirmed },
      {
        onSuccess: (data) => {
          if (!data) return
          setResult(data)
          setPending(null)
          setHistory(pushSqlHistory(connectionId, { sql: statement, at: new Date().toISOString(), ok: data.ok }))
          // 구조 문장이 성공하면 객체 목록이 달라졌을 수 있다 — 다시 읽는다
          if (data.kind === 'DDL' && data.ok) {
            void queryClient.invalidateQueries({ queryKey: databaseKeys.objects(workspaceId, connectionId) })
          }
        },
        onError: (error) => {
          if (isApiError(error) && error.resultCode === 'CONFIRMATION_REQUIRED') {
            const kind = error.errors?.[0]?.code === 'DDL' ? 'DDL' : 'WRITE'
            setPending({ sql: statement, kind })
            return
          }
          setPending(null)
          setResult(null)
          setRequestError(databaseErrorMessage(error))
        },
      },
    )
  }

  const runCurrent = () => {
    const textarea = textareaRef.current
    const statement = statementToRun(
      sql,
      textarea?.selectionStart ?? sql.length,
      textarea?.selectionEnd ?? sql.length,
      dbmsType.trim().toLowerCase() === 'mysql',
    )
    if (statement === '') return
    execute(statement, false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b p-2">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              runCurrent()
            }
          }}
          spellCheck={false}
          rows={8}
          aria-label={t('database.sql.input')}
          placeholder={t('database.sql.placeholder')}
          className="w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={runCurrent} disabled={run.isPending || sql.trim() === ''}>
            {run.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
            {t('database.sql.run')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('database.sql.runHint')}</span>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
            disabled={history.length === 0}
          >
            <History aria-hidden />
            {t('database.sql.history', { count: history.length })}
          </Button>
        </div>
        {historyOpen && history.length > 0 ? (
          <ul aria-label={t('database.sql.historyLabel')} className="max-h-40 overflow-y-auto rounded-md border text-sm">
            {history.map((entry) => (
              <li key={`${entry.at}:${entry.sql}`} className="border-b last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
                  onClick={() => {
                    setSql(entry.sql)
                    setHistoryOpen(false)
                    textareaRef.current?.focus()
                  }}
                >
                  {entry.ok ? (
                    <CircleCheck aria-hidden className="size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleX aria-hidden className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <code className="min-w-0 flex-1 truncate text-xs">{entry.sql}</code>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 결과 */}
      <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
        {requestError ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {requestError}
          </p>
        ) : result === null ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('database.sql.empty')}</p>
        ) : !result.ok ? (
          <div role="alert" className="grid gap-1 p-4 text-sm">
            <p className="font-medium text-destructive">{t('database.sql.failed')}</p>
            <pre className="whitespace-pre-wrap font-mono text-xs">{result.error?.message}</pre>
            {result.error?.sqlState ? (
              <p className="text-xs text-muted-foreground">SQLSTATE {result.error.sqlState}</p>
            ) : null}
          </div>
        ) : result.kind === 'READ' && result.columns && result.rows ? (
          <>
            {result.truncated ? (
              <p className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                {t('database.sql.truncated', { count: result.rows.length })}
              </p>
            ) : null}
            {result.columns.length > 0 ? <ResultTable columns={result.columns} rows={result.rows} /> : null}
            {result.rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('database.data.empty')}</p>
            ) : null}
          </>
        ) : (
          <div className="grid gap-1 p-4 text-sm">
            <p className="font-medium">
              {result.kind === 'WRITE' && result.affectedRows !== null
                ? t('database.sql.affected', { formatted: formatNumber(result.affectedRows) })
                : t('database.sql.done')}
            </p>
            {result.kind === 'DDL' ? <p className="text-muted-foreground">{t('database.sql.ddlNotice')}</p> : null}
          </div>
        )}
      </div>

      {/* 아래 줄 — 행 수·실행 시간·CSV */}
      {result ? (
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          {result.ok && result.rows ? <span>{t('database.data.rowsShown', { count: result.rows.length })}</span> : null}
          <span>{t('database.data.elapsed', { ms: result.elapsedMs })}</span>
          <div className="flex-1" />
          {result.ok && result.columns && result.rows && result.rows.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (result.columns && result.rows) {
                  downloadTextFile('query-result.csv', toCsv(result.columns, result.rows), 'text/csv')
                }
              }}
            >
              <Download aria-hidden />
              {t('database.data.downloadCsv')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending?.kind === 'DDL' ? t('database.sql.confirm.titleDdl') : t('database.sql.confirm.titleWrite')}
        description={
          <span className="grid gap-2">
            <span>{t('database.sql.confirm.target', { name: connectionName })}</span>
            <code className="block max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
              {pending?.sql}
            </code>
            <span className="font-medium text-destructive">{t('database.sql.confirm.irreversible')}</span>
          </span>
        }
        confirmLabel={t('database.sql.confirm.run')}
        destructive
        confirming={run.isPending}
        onConfirm={() => {
          if (pending) execute(pending.sql, true)
        }}
      />
    </div>
  )
}
