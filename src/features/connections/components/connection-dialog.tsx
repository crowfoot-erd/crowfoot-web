/**
 * 커넥션 등록/편집 다이얼로그 (storyboard 02-user §7 — 데이터베이스 탭)
 *
 * - 이름·DBMS·host·port·database·사용자·비밀번호 — DBMS 선택 시 포트 기본값(mysql 3306/pg 5432)
 * - 편집 시 비밀번호는 빈 칸이면 기존 값 유지(서버가 재암호화하지 않는다)
 * - 등록 자체는 접속 검증을 하지 않는다 — 저장 후 "테스트" 버튼으로 확인한다 (§3.2)
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DbConnection } from '@/api/types'
import { DEFAULT_PORTS } from '@/features/connections/api'
import { useCreateConnection, useUpdateConnection } from '@/features/connections/hooks'
import { useDatabaseTypes } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

export interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** 편집 대상 — null이면 등록 */
  connection: DbConnection | null
}

interface ConnectionFormValues {
  name: string
  dbmsType: string
  host: string
  port: number
  databaseName: string
  schemaName: string
  username: string
  password: string
}

function connectionSchema(requiredMessage: string, schemaPatternMessage: string) {
  const required = z.string().trim().min(1, requiredMessage)
  return z.object({
    name: required,
    dbmsType: required,
    host: required,
    // Input(type=number)의 값은 문자열로 들어오므로 onChange에서 Number로 변환한다(빈 칸은 undefined).
    // 스키마는 타입·범위를 검증 — undefined/문자열은 "필수" 안내로 떨어뜨린다
    port: z.number({ error: requiredMessage }).int().min(1).max(65535),
    databaseName: required,
    // PostgreSQL 스키마 — 빈 칸은 기본 스키마(해제). 식별자 패턴은 서버 규칙과 같다
    schemaName: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(v), schemaPatternMessage),
    username: required,
    // 편집에서는 빈 비밀번호 = 기존 유지 — 등록에서만 필요
    password: z.string(),
  })
}

export function ConnectionDialog({ open, onOpenChange, workspaceId, connection }: ConnectionDialogProps) {
  const { t } = useTranslation()
  const databaseTypes = useDatabaseTypes()
  const createMutation = useCreateConnection(workspaceId)
  const updateMutation = useUpdateConnection(workspaceId)
  const editing = connection !== null

  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(
      connectionSchema(t('connection.dialog.fieldRequired'), t('connection.dialog.schemaPattern')),
    ),
    defaultValues: {
      name: '',
      dbmsType: '',
      host: '',
      port: 5432,
      databaseName: '',
      schemaName: '',
      username: '',
      password: '',
    },
  })

  // 열릴 때 폼 시드 — 편집이면 기존 값, 등록이면 초기화(비밀번호는 항상 빈 칸)
  useEffect(() => {
    if (!open) return
    if (connection) {
      form.reset({
        name: connection.name,
        dbmsType: connection.dbmsType,
        host: connection.host,
        port: connection.port,
        databaseName: connection.databaseName,
        schemaName: connection.schemaName ?? '',
        username: connection.username,
        password: '',
      })
    } else {
      form.reset({
        name: '',
        dbmsType: '',
        host: '',
        port: 5432,
        databaseName: '',
        schemaName: '',
        username: '',
        password: '',
      })
    }
  }, [open, connection, form])

  // 코드 목록 도착 후 기본 선택 — 등록에서만, 아직 미선택이면 첫 항목(mysql).
  // reset 시드가 open 전환 시점에 폼을 비우므로 open(과 데이터) 변화마다 재판정한다
  useEffect(() => {
    if (!open || editing) return
    const codes = databaseTypes.data?.items.map((type) => type.code) ?? []
    if (codes.length > 0 && !codes.includes(form.getValues('dbmsType'))) {
      form.setValue('dbmsType', codes[0])
    }
  }, [open, editing, databaseTypes.data, form])

  const watchDbms = form.watch('dbmsType')
  const previousDbmsRef = useRef('')

  // DBMS 변경 시 포트 기본값 — 사용자가 고친 적 없는 포트(기본 포트 집합에 속할 때)만 덮어쓴다
  useEffect(() => {
    if (previousDbmsRef.current === watchDbms) return
    previousDbmsRef.current = watchDbms
    if (watchDbms === '') return
    if (Object.values(DEFAULT_PORTS).includes(form.getValues('port'))) {
      form.setValue('port', DEFAULT_PORTS[watchDbms] ?? 5432)
    }
  }, [watchDbms, form])

  const pending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = form.handleSubmit((values) => {
    const password = values.password.trim()
    // 스키마는 PostgreSQL에서만 의미가 있어 그때만 실린다 — 서버도 다른 DBMS면 거부한다.
    // 빈 칸은 해제(null)로 전송된다
    const schemaName = watchDbms === 'postgresql' ? values.schemaName.trim() || null : null
    if (editing && connection) {
      // 변경분만 전송 — 비밀번호는 입력했을 때만. 편집은 DBMS를 바꿀 수 없어 스키마도
      // PostgreSQL 커넥션에만 전송한다
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        dbmsType: values.dbmsType,
        host: values.host.trim(),
        port: values.port,
        databaseName: values.databaseName.trim(),
        username: values.username.trim(),
      }
      if (watchDbms === 'postgresql') body.schemaName = schemaName
      if (password) body.password = password
      updateMutation.mutate(
        { connectionId: connection.connectionId, body },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(t('connection.dialog.updateSuccess'))
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    } else {
      createMutation.mutate(
        {
          name: values.name.trim(),
          dbmsType: values.dbmsType,
          host: values.host.trim(),
          port: values.port,
          databaseName: values.databaseName.trim(),
          ...(watchDbms === 'postgresql' ? { schemaName } : {}),
          username: values.username.trim(),
          password,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(t('connection.dialog.createSuccess'))
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    }
  })

  const onOpen = (nextOpen: boolean) => {
    if (pending) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? t('connection.dialog.editTitle') : t('connection.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('connection.dialog.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('connection.dialog.name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('connection.dialog.namePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dbmsType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('connection.dialog.dbmsType')}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={editing}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(databaseTypes.data?.items ?? []).map((type) => (
                          <SelectItem key={type.code} value={type.code}>
                            {type.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('connection.dialog.port')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value
                          field.onChange(raw === '' ? undefined : Number(raw))
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('connection.dialog.host')}</FormLabel>
                  <FormControl>
                    <Input placeholder="db.example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="databaseName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('connection.dialog.database')}</FormLabel>
                  <FormControl>
                    <Input placeholder="orders" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchDbms === 'postgresql' ? (
              <FormField
                control={form.control}
                name="schemaName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('connection.dialog.schema')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('connection.dialog.schemaPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('connection.dialog.username')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('connection.dialog.password')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpen(false)} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
