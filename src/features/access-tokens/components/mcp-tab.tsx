/**
 * 워크스페이스 MCP 탭 — 액세스 토큰 목록·발급·폐기 (04-front/02-workspace.md §9)
 *
 * - 멤버 전체에게 보인다. Owner는 워크스페이스의 모든 토큰을, 그 밖의 멤버는 자기 토큰만 본다(서버가 거른다).
 * - 발급 직후에만 토큰 원문과 Claude Code 등록 명령을 보여 준다. 다시 볼 수 없다.
 * - 토큰은 발급한 사람의 권한으로 이 워크스페이스에서만 동작한다. 읽기 역할이면 읽기만 할 수 있다고 알린다.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  claudeMcpAddCommand,
  mcpServerName,
} from '@/features/access-tokens/api'
import { useAccessTokens, useIssueAccessToken, useRevokeAccessToken } from '@/features/access-tokens/hooks'
import { formatDate, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'
import { cn } from 'cn'

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
          <Link to="/guide#mcp" target="_blank" rel="noreferrer" className="underline underline-offset-3">
            {t('workspace.mcp.guideLink')}
          </Link>
        </AlertDescription>
      </Alert>

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
                  <TableCell className="font-mono text-xs text-muted-foreground">{token.tokenPrefix}…</TableCell>
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

      <IssuedTokenDialog
        token={issued}
        serverName={mcpServerName(workspaceName, workspaceId)}
        onClose={() => setIssued(null)}
      />

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
          <CopyBlock
            label={t('workspace.mcp.commandLabel')}
            value={claudeMcpAddCommand(serverName, raw)}
            testId="mcp-issued-command"
          />
          <p className="text-xs text-muted-foreground">{t('workspace.mcp.commandHint')}</p>
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
