/**
 * 발급 접속 정보 다이얼로그 (08-core/07 §3.7 — 데이터베이스 탭, 본인 발급 행)
 *
 * - 열릴 때마다 credential API를 호출해 복호화된 자격을 받는다(목록에 상시 노출하지 않는다)
 * - 필드별 복사 + JDBC URL 한 줄 복사 — 외부 클라이언트(DBeaver 등) 접속용
 * - 비밀번호는 기본 가림(눈 아이콘 토글) — 화면 공유 노출 완화
 */
import { useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/error-state'
import type { ManagedCredential, ManagedDatabase } from '@/api/types'
import { useManagedCredential } from '@/features/managed/hooks'
import { errorMessage } from '@/lib/result-code'

/** DBMS별 JDBC URL — 외부 클라이언트가 문서 배포와 같은 대상에 접속하는 기준 */
function jdbcUrl(credential: ManagedCredential): string {
  if (credential.dbmsType === 'mysql') {
    return `jdbc:mysql://${credential.host}:${credential.port}/${credential.databaseName}`
  }
  const schema = credential.schemaName
    ? `?currentSchema=${credential.schemaName}`
    : ''
  return `jdbc:postgresql://${credential.host}:${credential.port}/${credential.databaseName}${schema}`
}

/** 한 줄 필드 — 라벨 · 값(모노) · 복사 버튼. password는 가림 토글 */
function CredentialRow({
  label,
  value,
  secret = false,
}: {
  label: string
  value: string
  secret?: boolean
}) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(t('managed.credential.copied'))
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="w-24 shrink-0 pt-1.5 text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-start gap-1">
        {/* break-all — JDBC URL처럼 끊기 없이는 한 줄에 안 들어오는 값도 전체가 보이게 줄바꿈한다(truncate는 값의 끝을 가린다) */}
        <code className="min-w-0 flex-1 break-all rounded-md bg-muted/60 px-2 py-1 text-left font-mono text-xs">
          {secret && !revealed ? '•'.repeat(Math.min(value.length, 12)) : value}
        </code>
        {secret ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={revealed ? t('managed.credential.hide') : t('managed.credential.reveal')}
            onClick={() => setRevealed((prev) => !prev)}
          >
            {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={`${label} ${t('managed.credential.copy')}`}
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
    </div>
  )
}

export interface CredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 접속 정보를 보려는 발급 — null이면 닫힌 상태 */
  database: ManagedDatabase | null
}

export function CredentialDialog({ open, onOpenChange, workspaceId, database }: CredentialDialogProps) {
  const { t } = useTranslation()
  const credentialMutation = useManagedCredential(workspaceId)

  // 열릴 때마다 새로 받는다 — 자격은 요청 시 복호화되는 계약이라 캐시하지 않는다
  useEffect(() => {
    if (open && database) {
      credentialMutation.mutate(database.databaseId)
    }
    // mutate는 스테이블 — database·open 변경 시에만 호출한다
  }, [open, database?.databaseId])

  const credential = credentialMutation.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('managed.credential.title')}
            {database ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {database.schemaName}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>{t('managed.credential.description')}</DialogDescription>
        </DialogHeader>

        {credentialMutation.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : credentialMutation.isError || !credential ? (
          <ErrorState onRetry={() => database && credentialMutation.mutate(database.databaseId)} />
        ) : (
          <div className="flex flex-col divide-y">
            <CredentialRow label={t('managed.credential.host')} value={`${credential.host}:${credential.port}`} />
            <CredentialRow label={t('managed.credential.database')} value={credential.databaseName} />
            {credential.schemaName ? (
              <CredentialRow label={t('managed.credential.schema')} value={credential.schemaName} />
            ) : null}
            <CredentialRow label={t('managed.credential.username')} value={credential.username} />
            <CredentialRow label={t('managed.credential.password')} value={credential.password} secret />
            <CredentialRow label="JDBC URL" value={jdbcUrl(credential)} />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
        {credentialMutation.isError ? (
          <p className="text-xs text-destructive">{errorMessage(credentialMutation.error)}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
