/**
 * 매니지드 인스턴스 등록/편집 다이얼로그 (08-core/07 §3.2~3.3 — 관리자)
 *
 * - DBMS 드롭다운 — 공개 database-types(코드 테이블) 표시명 중 발급을 지원하는 것만 노출.
 *   최종 판정은 서버 프로비저너 레지스트리가 한다(이 목록은 옵션 표시용 필터)
 * - 표시명·host·port·database(선택)·사용자·비밀번호 — 발급 한도는 워크스페이스 내
 *   사용자당 5개로 서비스 고정이라 인스턴스 설정에 없다
 * - database 생략 — PostgreSQL은 username과 같은 database 폴백, MySQL은 발급 시 database 생성
 * - 등록·자격 변경은 서버가 접속 검증(SELECT 1)한다 — 실패 시 502 문구로 안내
 * - 편집 시 DBMS는 바꿀 수 없고 비밀번호는 빈 칸이면 기존 값 유지
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
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
import type { ManagedInstance } from '@/api/types'
import { useCreateManagedInstance, useUpdateManagedInstance } from '@/features/managed/hooks'
import { MANAGED_DBMS_CODES, managedDefaultPort } from '@/features/managed/supported-dbms'
import { useDatabaseTypes } from '@/features/models/hooks'
import { errorMessage } from '@/lib/result-code'

export interface InstanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 편집 대상 — null이면 등록 */
  instance: ManagedInstance | null
}

interface InstanceFormValues {
  displayName: string
  dbmsType: string
  host: string
  port: number
  databaseName: string
  username: string
  password: string
}

function instanceSchema(fieldRequired: string) {
  const required = z.string().trim().min(1, fieldRequired)
  return z.object({
    displayName: required,
    dbmsType: required,
    host: required,
    port: z.number({ error: fieldRequired }).int().min(1).max(65535),
    // database는 선택 — 생략 시 PG는 username 폴백, MySQL은 발급 시 생성
    databaseName: z.string(),
    username: required,
    // 등록에서만 필요, 편집에서는 빈 칸 = 기존 유지
    password: z.string(),
  })
}

export function InstanceDialog({ open, onOpenChange, instance }: InstanceDialogProps) {
  const { t } = useTranslation()
  const createMutation = useCreateManagedInstance()
  const updateMutation = useUpdateManagedInstance()
  const editing = instance !== null

  // 드롭다운 옵션 — 코드 테이블 표시명 중 발급 지원 DBMS만 (불러오기 실패 시 코드명 폴백)
  const databaseTypes = useDatabaseTypes()
  const dbmsOptions = MANAGED_DBMS_CODES.map((code) => ({
    code,
    label: databaseTypes.data?.items.find((type) => type.code === code)?.displayName ?? code,
  }))

  const form = useForm<InstanceFormValues>({
    resolver: zodResolver(instanceSchema(t('admin.managed.dialog.fieldRequired'))),
    defaultValues: {
      displayName: '',
      dbmsType: 'postgresql',
      host: '',
      port: 5432,
      databaseName: '',
      username: '',
      password: '',
    },
  })

  // 열릴 때 폼 시드 — 편집이면 기존 값, 등록이면 초기화(비밀번호는 항상 빈 칸)
  useEffect(() => {
    if (!open) return
    form.reset(
      instance
        ? {
            displayName: instance.displayName,
            dbmsType: instance.dbmsType,
            host: instance.host,
            port: instance.port,
            databaseName: instance.databaseName ?? '',
            username: instance.username,
            password: '',
          }
        : {
            displayName: '',
            dbmsType: 'postgresql',
            host: '',
            port: 5432,
            databaseName: '',
            username: '',
            password: '',
          },
    )
  }, [open, instance, form])

  // DBMS 전환 시 포트가 표준 기본값(또는 빈 칸)이면 새 기본 포트로 맞춘다 — 커스텀 포트는 유지
  const dbmsType = form.watch('dbmsType')
  useEffect(() => {
    if (editing) return
    const port = form.getValues('port')
    if (!port || MANAGED_DBMS_CODES.some((code) => managedDefaultPort(code) === port)) {
      form.setValue('port', managedDefaultPort(dbmsType) ?? port)
    }
  }, [dbmsType, editing, form])

  const pending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = form.handleSubmit((values) => {
    const password = values.password.trim()
    if (editing && instance) {
      // 자격이 하나라도 오면 서버가 새 조합으로 재검증한다 — 변경분만 전송.
      // databaseName은 빈 칸 → null 전송으로 "제거"(username 폴백)를 표현한다
      updateMutation.mutate(
        {
          instanceId: instance.instanceId,
          body: {
            displayName: values.displayName.trim(),
            host: values.host.trim(),
            port: values.port,
            databaseName: values.databaseName.trim() || null,
            username: values.username.trim(),
            ...(password ? { password } : {}),
          },
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(t('admin.managed.dialog.updateSuccess'))
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    } else {
      createMutation.mutate(
        {
          displayName: values.displayName.trim(),
          dbmsType: values.dbmsType,
          host: values.host.trim(),
          port: values.port,
          databaseName: values.databaseName.trim() || null,
          username: values.username.trim(),
          password,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(t('admin.managed.dialog.createSuccess'))
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
            {editing ? t('admin.managed.dialog.editTitle') : t('admin.managed.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('admin.managed.dialog.notice')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.managed.dialog.displayName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('admin.managed.dialog.displayNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dbmsType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.managed.dialog.dbms')}</FormLabel>
                  {/* DBMS는 등록 후 바꿀 수 없다 — 발급 스키마 문법이 DBMS별로 다르므로 */}
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={editing || pending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {dbmsOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
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
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.managed.dialog.host')}</FormLabel>
                  <FormControl>
                    <Input placeholder="db.example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.managed.dialog.port')}</FormLabel>
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
              <FormField
                control={form.control}
                name="databaseName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.managed.dialog.database')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('admin.managed.dialog.databasePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t('admin.managed.dialog.databaseHint')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.managed.dialog.username')}</FormLabel>
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
                    <FormLabel>{t('admin.managed.dialog.password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={editing ? t('admin.managed.dialog.passwordKeep') : undefined}
                        {...field}
                      />
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
