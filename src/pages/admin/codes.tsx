/**
 * S-11 코드 테이블 관리 (storyboard 03-admin §5)
 * providers(활성 토글 즉시 PATCH·표시명 인라인 편집·전 비활성화 경고)
 * + databaseTypes(표시명·활성 토글 — ERD 문서 종류) + roles(표시명만·level 미노출)
 */
import { useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorState } from '@/components/error-state'
import type { AdminDatabaseType, AdminProvider, AdminRole } from '@/api/types'
import {
  useAdminDatabaseTypes,
  useAdminProviders,
  useAdminRoles,
  useUpdateAdminDatabaseType,
  useUpdateAdminProvider,
  useUpdateAdminRole,
} from '@/features/admin'
import { errorMessage } from '@/lib/result-code'

/** 표시명 인라인 편집 행 — dirty일 때만 저장 버튼 */
function DisplayNameEditor({
  code,
  initialDisplayName,
  saving,
  onSave,
}: {
  code: string
  initialDisplayName: string
  saving: boolean
  onSave: (displayName: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialDisplayName)
  const dirty = value.trim() !== initialDisplayName && value.trim().length > 0

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`${code} display name`}
        className="h-8 w-44"
        disabled={saving}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.save')}
        disabled={!dirty || saving}
        onClick={() => onSave(value.trim())}
      >
        <Check aria-hidden />
      </Button>
    </div>
  )
}

export function AdminCodesPage() {
  const { t } = useTranslation()
  const providers = useAdminProviders()
  const databaseTypes = useAdminDatabaseTypes()
  const roles = useAdminRoles()
  const updateProvider = useUpdateAdminProvider()
  const updateDatabaseType = useUpdateAdminDatabaseType()
  const updateRole = useUpdateAdminRole()

  const providerItems = providers.data?.items ?? []
  const allDisabled =
    providerItems.length > 0 && providerItems.every((provider) => !provider.isActive)

  const handleToggle = (provider: AdminProvider, isActive: boolean) => {
    // 토글 = 즉시 PATCH (확인 없음 — 되돌릴 수 있으므로)
    updateProvider.mutate(
      { code: provider.code, isActive },
      {
        onSuccess: () => toast.success(t('admin.codes.providers.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const handleProviderDisplayName = (provider: AdminProvider, displayName: string) => {
    updateProvider.mutate(
      { code: provider.code, displayName },
      {
        onSuccess: () => toast.success(t('admin.codes.providers.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const handleDatabaseTypeToggle = (type: AdminDatabaseType, isActive: boolean) => {
    updateDatabaseType.mutate(
      { code: type.code, isActive },
      {
        onSuccess: () => toast.success(t('admin.codes.databaseTypes.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const handleDatabaseTypeDisplayName = (type: AdminDatabaseType, displayName: string) => {
    updateDatabaseType.mutate(
      { code: type.code, displayName },
      {
        onSuccess: () => toast.success(t('admin.codes.databaseTypes.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const handleRoleDisplayName = (role: AdminRole, displayName: string) => {
    updateRole.mutate(
      { code: role.code, displayName },
      {
        onSuccess: () => toast.success(t('admin.codes.roles.savedToast')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const pendingCode =
    updateProvider.isPending || updateDatabaseType.isPending || updateRole.isPending

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.codes.title')}</h1>

      {/* providers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.codes.providers.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.codes.providers.notice')}</p>
          {allDisabled ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <TriangleAlert aria-hidden className="h-4 w-4" />
              {t('admin.codes.providers.allDisabledWarning')}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {providers.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : providers.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void providers.refetch()} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t('admin.codes.providers.table.code')}</TableHead>
                  <TableHead>{t('admin.codes.providers.table.displayName')}</TableHead>
                  <TableHead className="w-24 text-right">{t('admin.codes.providers.table.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerItems.map((provider) => (
                  <TableRow key={provider.code}>
                    <TableCell className="font-mono text-xs">{provider.code}</TableCell>
                    <TableCell>
                      <DisplayNameEditor
                        code={provider.code}
                        initialDisplayName={provider.displayName}
                        saving={pendingCode}
                        onSave={(displayName) => handleProviderDisplayName(provider, displayName)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={provider.isActive}
                        onCheckedChange={(checked) => handleToggle(provider, checked)}
                        disabled={updateProvider.isPending}
                        aria-label={`${provider.code} ${t('admin.codes.providers.table.active')}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* databaseTypes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.codes.databaseTypes.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.codes.databaseTypes.notice')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {databaseTypes.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : databaseTypes.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void databaseTypes.refetch()} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t('admin.codes.databaseTypes.table.code')}</TableHead>
                  <TableHead>{t('admin.codes.databaseTypes.table.displayName')}</TableHead>
                  <TableHead className="w-24 text-right">{t('admin.codes.databaseTypes.table.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(databaseTypes.data?.items ?? []).map((type) => (
                  <TableRow key={type.code}>
                    <TableCell className="font-mono text-xs">{type.code}</TableCell>
                    <TableCell>
                      <DisplayNameEditor
                        code={type.code}
                        initialDisplayName={type.displayName}
                        saving={pendingCode}
                        onSave={(displayName) => handleDatabaseTypeDisplayName(type, displayName)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={type.isActive}
                        onCheckedChange={(checked) => handleDatabaseTypeToggle(type, checked)}
                        disabled={updateDatabaseType.isPending}
                        aria-label={`${type.code} ${t('admin.codes.databaseTypes.table.active')}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.codes.roles.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.codes.roles.notice')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {roles.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : roles.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void roles.refetch()} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t('admin.codes.roles.table.code')}</TableHead>
                  <TableHead>{t('admin.codes.roles.table.displayName')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles.data?.items ?? []).map((role) => (
                  <TableRow key={role.code}>
                    <TableCell className="font-mono text-xs">{role.code}</TableCell>
                    <TableCell>
                      <DisplayNameEditor
                        code={role.code}
                        initialDisplayName={role.displayName}
                        saving={pendingCode}
                        onSave={(displayName) => handleRoleDisplayName(role, displayName)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
