/**
 * 워크스페이스 MCP 탭 — 액세스 토큰 목록·발급·폐기 (04-front/02-workspace.md §9)
 *
 * - 멤버 전체에게 보인다. Owner는 워크스페이스의 모든 토큰을, 그 밖의 멤버는 자기 토큰만 본다(서버가 거른다).
 * - 토큰 원문은 발급한 본인에게만 보인다. 연결 방법의 명령에 채워 넣고, 목록의 행에서 복사한다.
 *   남의 토큰(Owner가 볼 때)과 예전 토큰은 앞부분만 보인다.
 * - 토큰은 발급한 사람의 권한으로 이 워크스페이스에서만 동작한다. 읽기 역할이면 읽기만 할 수 있다고 알린다.
 */
import { useState } from 'react'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import type { WorkspaceAccessToken, WorkspaceRole } from '@/api/types'
import {
  ACCESS_TOKEN_LIMIT,
  EXPIRY_OPTIONS,
  MCP_CLIENTS,
  mcpRegistration,
  mcpServerName,
  type McpClient,
} from '@/features/access-tokens/api'
import { currentLanguage } from '@/lib/i18n'
import { useAccessTokens, useIssueAccessToken, useRevokeAccessToken } from '@/features/access-tokens/hooks'
import { formatDate, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { cn } from 'cn'

/** 사용 방법의 단계와 예시 요청 — 문구는 번역 파일에 있다 */
const USAGE_STEPS = ['run', 'check', 'ask', 'open'] as const
const USAGE_EXAMPLES = ['list', 'create', 'requirement', 'modify', 'ddl', 'deploy', 'sample'] as const

interface McpTabProps {
  workspaceId: string
  workspaceName: string
  myRole: WorkspaceRole | undefined
}

export function McpTab({ workspaceId, workspaceName, myRole }: McpTabProps) {
  const { t } = useTranslation()
  const tokens = useAccessTokens(workspaceId)
  const revokeMutation = useRevokeAccessToken(workspaceId)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issued, setIssued] = useState<WorkspaceAccessToken | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<WorkspaceAccessToken | null>(null)

  const items = tokens.data?.items ?? []
  /** 원문을 볼 수 있는 토큰 — 내가 발급한 것. 연결 방법의 명령에 채워 넣는다 */
  const revealable = items.filter((token) => typeof token.token === 'string' && token.token.length > 0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = revealable.find((token) => token.tokenId === pickedId) ?? revealable[0] ?? null
  const serverName = mcpServerName(workspaceName, workspaceId)
  const guidePath = currentLanguage() === 'ko' ? '/guide' : `/${currentLanguage()}/guide`
  const readOnlyRole = myRole === 'VIEWER' || myRole === 'COMMENTER'

  const handleRevoke = () => {
    if (!revokeTarget) return
    revokeMutation.mutate(revokeTarget.tokenId, {
      onSuccess: () => {
        toast.success(t('workspace.mcp.revokeSuccess'))
        setRevokeTarget(null)
      },
      onError: (error) => {
        setRevokeTarget(null)
        toast.error(errorMessage(error))
        void tokens.refetch()
      },
    })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="mcp-tab">
      <Alert>
        <KeyRound aria-hidden />
        <AlertTitle>{t('workspace.mcp.introTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('workspace.mcp.intro')}</p>
          {readOnlyRole ? <p data-testid="mcp-readonly-notice">{t('workspace.mcp.readOnlyNotice')}</p> : null}
          {/* 사용 가이드의 "연결하기" 소제목으로 바로 간다(새 창, 지금 언어의 주소) */}
          <a href={`${guidePath}#20.1`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-3" data-testid="mcp-guide-link">
            {t('workspace.mcp.guideLink')}
          </a>
        </AlertDescription>
      </Alert>

      {/* 연결 방법 — 늘 보인다. 내가 발급한 토큰이 있으면 명령에 채워 넣고, 없으면 자리 표시로 보여 준다 */}
      <section className="rounded-lg border p-4" data-testid="mcp-connect">
        <h2 className="text-base font-semibold">{t('workspace.mcp.connectTitle')}</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground" data-testid="mcp-connect-hint">
          {picked ? t('workspace.mcp.connectHintReady') : t('workspace.mcp.connectHintEmpty')}
        </p>
        {revealable.length > 1 ? (
          <div className="mb-3 flex items-center gap-2">
            <Label htmlFor="mcp-connect-token">{t('workspace.mcp.connectToken')}</Label>
            <select
              id="mcp-connect-token"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={picked?.tokenId ?? ''}
              onChange={(event) => setPickedId(event.target.value)}
            >
              {revealable.map((token) => (
                <option key={token.tokenId} value={token.tokenId}>
                  {token.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <ConnectCommands serverName={serverName} token={picked?.token ?? null} />
      </section>

      {/* 사용 방법 — 연결한 뒤에 무엇을 하는지. 예시 요청은 복사해서 그대로 붙여 넣는다 */}
      <section className="rounded-lg border p-4" data-testid="mcp-usage">
        <h2 className="text-base font-semibold">{t('workspace.mcp.usage.title')}</h2>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
          {USAGE_STEPS.map((step) => (
            <li key={step}>{t(`workspace.mcp.usage.steps.${step}`)}</li>
          ))}
        </ol>
        <p className="mt-4 mb-2 text-sm font-medium">{t('workspace.mcp.usage.examplesTitle')}</p>
        <ul className="grid gap-1.5">
          {USAGE_EXAMPLES.map((example) => {
            const text = t(`workspace.mcp.usage.examples.${example}`)
            return (
              <li key={example} className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm" data-testid="mcp-usage-example">
                <span className="min-w-0">{text}</span>
                <CopyIconButton value={text} label={t('workspace.mcp.copy')} testId="mcp-usage-copy" />
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t('workspace.mcp.usage.note')}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {t('workspace.mcp.title')}
          {tokens.data ? ` (${tokens.data.totalCount})` : ''}
        </h2>
        <Button type="button" size="sm" onClick={() => setIssueOpen(true)} data-testid="mcp-issue-button">
          <Plus aria-hidden />
          {t('workspace.mcp.issueButton')}
        </Button>
      </div>

      {tokens.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : tokens.isError ? (
        <ErrorState onRetry={() => void tokens.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState illustration="search" title={t('workspace.mcp.empty')} description={t('workspace.mcp.emptyDetail')} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workspace.mcp.table.name')}</TableHead>
                <TableHead className="w-36">{t('workspace.mcp.table.prefix')}</TableHead>
                <TableHead className="w-32">{t('workspace.mcp.table.createdBy')}</TableHead>
                <TableHead className="w-28">{t('workspace.mcp.table.createdAt')}</TableHead>
                <TableHead className="w-28">{t('workspace.mcp.table.expiresAt')}</TableHead>
                <TableHead className="w-40">{t('workspace.mcp.table.lastUsedAt')}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t('workspace.mcp.table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((token) => (
                <TableRow key={token.tokenId} data-testid="mcp-token-row">
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {token.tokenPrefix}…
                      {token.token ? <CopyIconButton value={token.token} label={t('workspace.mcp.copyToken')} /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{token.createdBy?.name ?? '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(token.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {token.expiresAt ? formatDate(token.expiresAt) : t('workspace.mcp.noExpiry')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : t('workspace.mcp.neverUsed')}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('workspace.mcp.revoke')}
                      title={t('workspace.mcp.revoke')}
                      onClick={() => setRevokeTarget(token)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <IssueTokenDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        workspaceId={workspaceId}
        onIssued={(token) => {
          setIssueOpen(false)
          setIssued(token)
        }}
      />

      <IssuedTokenDialog token={issued} serverName={serverName} onClose={() => setIssued(null)} />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title={t('workspace.mcp.revokeTitle')}
        description={t('workspace.mcp.revokeDescription', { name: revokeTarget?.name ?? '' })}
        confirmLabel={t('workspace.mcp.revoke')}
        destructive
        confirming={revokeMutation.isPending}
        onConfirm={handleRevoke}
      />
    </div>
  )
}

/* ---------- 발급 ---------- */

function IssueTokenDialog({
  open,
  onOpenChange,
  workspaceId,
  onIssued,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  onIssued: (token: WorkspaceAccessToken) => void
}) {
  const { t } = useTranslation()
  const issueMutation = useIssueAccessToken(workspaceId)
  const [name, setName] = useState('')
  const [days, setDays] = useState<(typeof EXPIRY_OPTIONS)[number]>(90)
  const [nameError, setNameError] = useState(false)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameError(true)
      return
    }
    issueMutation.mutate(
      { name: trimmed, ...(days === null ? {} : { expiresInDays: days }) },
      {
        onSuccess: (token) => {
          if (!token) return
          setName('')
          setDays(90)
          onIssued(token)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="mcp-issue-dialog">
        <DialogHeader>
          <DialogTitle>{t('workspace.mcp.issueTitle')}</DialogTitle>
          <DialogDescription>{t('workspace.mcp.issueDescription', { max: ACCESS_TOKEN_LIMIT })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-token-name">{t('workspace.mcp.nameLabel')}</Label>
            <Input
              id="mcp-token-name"
              value={name}
              maxLength={100}
              placeholder={t('workspace.mcp.namePlaceholder')}
              aria-invalid={nameError}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(false)
              }}
            />
            {nameError ? <p className="text-xs text-destructive">{t('workspace.mcp.nameRequired')}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label>{t('workspace.mcp.expiryLabel')}</Label>
            <div className="flex rounded-md border p-0.5" role="group" aria-label={t('workspace.mcp.expiryLabel')}>
              {EXPIRY_OPTIONS.map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  aria-pressed={days === option}
                  onClick={() => setDays(option)}
                  className={cn(
                    'h-7 flex-1 rounded-sm px-2 text-xs font-medium',
                    days === option ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {option === null ? t('workspace.mcp.noExpiry') : t('workspace.mcp.expiryDays', { days: option })}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={issueMutation.isPending}>
              {t('workspace.mcp.issueConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- 발급 직후 — 원문과 등록 명령을 한 번만 보여 준다 ---------- */

function IssuedTokenDialog({
  token,
  serverName,
  onClose,
}: {
  token: WorkspaceAccessToken | null
  serverName: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const raw = token?.token ?? ''
  return (
    <Dialog
      open={token !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl" data-testid="mcp-issued-dialog">
        <DialogHeader>
          <DialogTitle>{t('workspace.mcp.issuedTitle')}</DialogTitle>
          <DialogDescription>{t('workspace.mcp.issuedDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <CopyBlock label={t('workspace.mcp.tokenLabel')} value={raw} testId="mcp-issued-token" />
          <ConnectCommands serverName={serverName} token={raw} />
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('workspace.mcp.issuedClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 값 하나를 복사하는 아이콘 버튼 — 토큰 목록의 행에서 쓴다 */
function CopyIconButton({ value, label, testId = 'mcp-token-copy' }: { value: string; label: string; testId?: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-6"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true)
            toast.success(t('workspace.mcp.copied'))
            setTimeout(() => setCopied(false), 2000)
          },
          () => toast.error(t('workspace.mcp.copyFailed')),
        )
      }}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
    </Button>
  )
}

/**
 * 클라이언트별 등록 방법 — Claude Code는 터미널 명령, ChatGPT(Codex)는 설정 파일에 붙여 넣는 블록.
 * token이 null이면 자리 표시(<토큰>)를 넣어 보여 준다.
 */
function ConnectCommands({ serverName, token }: { serverName: string; token: string | null }) {
  const { t } = useTranslation()
  const [client, setClient] = useState<McpClient>('claude')
  return (
    <div className="grid gap-2">
      <div className="flex w-fit rounded-md border p-0.5" role="group" aria-label={t('workspace.mcp.clientLabel')}>
        {MCP_CLIENTS.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`mcp-client-${option}`}
            aria-pressed={client === option}
            onClick={() => setClient(option)}
            className={cn(
              'h-7 rounded-sm px-3 text-xs font-medium',
              client === option ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {t(`workspace.mcp.client.${option}`)}
          </button>
        ))}
      </div>
      <CopyBlock
        label={client === 'claude' ? t('workspace.mcp.commandLabel') : t('workspace.mcp.codexLabel')}
        value={mcpRegistration(client, serverName, token ?? t('workspace.mcp.tokenPlaceholder'))}
        testId="mcp-command"
      />
      <p className="text-xs text-muted-foreground">
        {client === 'claude' ? t('workspace.mcp.commandHint') : t('workspace.mcp.codexHint')}
      </p>
    </div>
  )
}

function CopyBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('workspace.mcp.copyFailed'))
    }
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => void copy()}>
          {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          {copied ? t('workspace.mcp.copied') : t('workspace.mcp.copy')}
        </Button>
      </div>
      <pre
        data-testid={testId}
        className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs"
      >
        {value}
      </pre>
    </div>
  )
}
