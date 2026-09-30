/**
 * 문서-데이터베이스 최초 연결 다이얼로그 — 공용 레이어 (08-core/02-model.md §1.14)
 *
 * ERD 탭 행 액션과 에디터 툴바가 같은 이 컴포넌트로 연결시킨다(양쪽 진입점, 공통 구조).
 * 대상은 문서 DBMS와 같은 dbmsType의 커넥션만 노출한다(다르면 서버가 400으로 거부).
 * 이미 연결된 문서에는 진입점 자체가 없으므로 409 MODEL_ALREADY_CONNECTED는
 * 서버 가드 실패 안내로만 다룬다(해지·전환은 후속 버전).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { ModelSummary } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchConnections } from '@/features/connections/api'
import { useConnectModel } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

export interface ConnectDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 연결할 문서 — id는 연결 대상, 이름·DBMS는 안내 문구·커넥션 필터에 쓴다 */
  model: Pick<ModelSummary, 'modelId' | 'name' | 'databaseType'>
}

export function ConnectDatabaseDialog({
  open,
  onOpenChange,
  workspaceId,
  model,
}: ConnectDatabaseDialogProps) {
  const { t } = useTranslation()
  const [connectionId, setConnectionId] = useState('')
  const connect = useConnectModel(workspaceId)

  const connections = useQuery({
    queryKey: ['workspaces', workspaceId, 'connections'],
    queryFn: ({ signal }) => fetchConnections(workspaceId, signal),
    enabled: open,
  })

  // 같은 DBMS 커넥션만 — 방언이 다르면 서버가 400으로 거부한다
  const matching = (connections.data?.items ?? []).filter(
    (connection) => connection.dbmsType === model.databaseType,
  )

  // 목록 도착 후 기본 선택 — 열 때마다 재판정한다(다이얼로그 폼 관례: 상태 초기화 시점과 무관하게)
  useEffect(() => {
    if (!open) return
    setConnectionId((current) => {
      if (matching.length === 0) return ''
      return matching.some((connection) => connection.connectionId === current)
        ? current
        : matching[0].connectionId
    })
  }, [open, matching])

  const run = () => {
    if (connectionId === '') return
    connect.mutate(
      { modelId: model.modelId, connectionId },
      {
        onSuccess: () => {
          onOpenChange(false)
          toast.success(t('model.connect.successToast', { name: model.name }))
        },
        // 실패는 다이얼로그 안내로만 — 토스트를 치지 않는다(폼 관례)
        onError: () => {},
      },
    )
  }

  const selected = matching.find((connection) => connection.connectionId === connectionId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('model.connect.title')}</DialogTitle>
          <DialogDescription>
            {t('model.connect.description', { model: model.name })}
          </DialogDescription>
        </DialogHeader>

        {connections.isPending ? (
          <div className="flex h-16 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : matching.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('model.connect.noMatchingConnection', { dbms: model.databaseType })}
          </p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="connect-connection">{t('model.connect.connection')}</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="connect-connection" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matching.map((connection) => (
                  <SelectItem key={connection.connectionId} value={connection.connectionId}>
                    {connection.name} ({connection.host}:{connection.port}/{connection.databaseName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.username}@{selected.host}:{selected.port}/{selected.databaseName}
              </p>
            ) : null}
          </div>
        )}

        {connect.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-xs text-foreground">
            {errorMessage(connect.error)}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={run} disabled={connect.isPending || connectionId === ''}>
            {connect.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Link2 aria-hidden className="size-4" />
            )}
            {connect.isPending ? t('model.connect.connecting') : t('model.connect.connect')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
