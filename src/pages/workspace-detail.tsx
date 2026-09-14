/**
 * S-05 워크스페이스 상세 (storyboard 02-user §5)
 *
 * - 탭 = 쿼리 파라미터 ?tab=erd|overview|members|settings (기본 erd) — 새로고침·공유 링크 유지
 * - 설정 탭은 myRole==="OWNER"만 노출·직접 접근은 개요로 강제
 * - 404 WORKSPACE_NOT_FOUND → §4.2 존재 은닉 패턴
 */
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ErrorState } from '@/components/error-state'
import { NotFoundContent } from '@/components/not-found-content'
import {
  MembersTab,
  useDeleteWorkspace,
  useMyWorkspaces,
  useUpdateWorkspace,
  useWorkspace,
} from '@/features/workspaces'
import { isApiError } from '@/api/client'
import { DatabaseTab } from '@/features/connections'
import { ErdTab } from '@/features/models'
import { formatDate } from '@/lib/format'
import { setLastWorkspaceId } from '@/lib/last-workspace'
import { errorMessage } from '@/lib/result-code'

type TabValue = 'erd' | 'database' | 'overview' | 'members' | 'settings'

const TAB_VALUES: TabValue[] = ['erd', 'database', 'overview', 'members', 'settings']

/* ---------- 개요 정의표 ---------- */

function OverviewTab({ workspace }: { workspace: NonNullable<ReturnType<typeof useWorkspace>['data']> }) {
  const { t } = useTranslation()

  const rows: Array<[string, React.ReactNode]> = [
    [t('workspace.detail.fields.name'), workspace.name],
    [t('workspace.detail.fields.description'), workspace.description ?? t('common.none')],
    [
      t('workspace.detail.fields.createdBy'),
      <span key="owner">
        {workspace.createdBy.name}{' '}
        <span className="text-muted-foreground">({t('common.createdAt')}: {formatDate(workspace.createdAt)})</span>
      </span>,
    ],
    [t('workspace.detail.fields.memberCount'), t('common.memberCount', { count: workspace.memberCount })],
    [t('workspace.detail.fields.createdAt'), formatDate(workspace.createdAt)],
  ]

  return (
    <Card>
      <CardContent className="p-0">
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={String(label)} className="grid grid-cols-[8rem_1fr] gap-4 px-4 py-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/* ---------- 설정 (Owner만) ---------- */

interface SettingsFormValues {
  name: string
  description: string
}

function SettingsTab({
  workspace,
  workspaceId,
}: {
  workspace: NonNullable<ReturnType<typeof useWorkspace>['data']>
  workspaceId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateMutation = useUpdateWorkspace(workspaceId)
  const deleteMutation = useDeleteWorkspace()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const form = useForm<SettingsFormValues>({
    defaultValues: { name: workspace.name, description: workspace.description ?? '' },
  })

  const name = form.watch('name')
  const description = form.watch('description')
  const dirty =
    name.trim() !== workspace.name || description.trim() !== (workspace.description ?? '')

  const handleSubmit = form.handleSubmit((values) => {
    // 변경분만 전송 — 설명 비우기는 null(명시적 클리어)
    const body: Partial<{ name: string; description: string | null }> = {}
    if (values.name.trim() !== workspace.name) body.name = values.name.trim()
    if (values.description.trim() !== (workspace.description ?? '')) {
      body.description = values.description.trim() || null
    }
    updateMutation.mutate(body, {
      onSuccess: () => toast.success(t('workspace.detail.settings.saveSuccess')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  })

  const handleDelete = () => {
    deleteMutation.mutate(workspaceId, {
      onSuccess: () => {
        setDeleteOpen(false)
        toast.success(t('workspace.detail.settings.deleteSuccess'))
        navigate('/workspaces')
      },
      onError: (error) => {
        setDeleteOpen(false)
        toast.error(errorMessage(error))
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('common.settings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSubmit} className="grid max-w-lg gap-4" noValidate>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.description')}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <Button type="submit" disabled={!dirty || updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  {t('workspace.detail.settings.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            {t('workspace.detail.settings.dangerZone')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-muted-foreground">
            {t('workspace.detail.settings.deleteDescription', { name: workspace.name })}
          </p>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            {t('workspace.detail.settings.deleteButton')}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('workspace.detail.settings.deleteTitle')}
        description={t('workspace.detail.settings.deleteDescription', { name: workspace.name })}
        confirmLabel={t('workspace.detail.settings.deleteConfirm')}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}

/* ---------- 페이지 ---------- */

export function WorkspaceDetailPage() {
  const { t } = useTranslation()
  const { workspaceId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const workspace = useWorkspace(workspaceId)
  const myWorkspaces = useMyWorkspaces()

  const myRole = myWorkspaces.data?.items.find((item) => item.workspaceId === workspaceId)?.myRole
  const isOwner = myRole === 'OWNER'

  const tabParam = searchParams.get('tab') as TabValue | null
  const activeTab: TabValue = TAB_VALUES.includes(tabParam as TabValue) ? (tabParam as TabValue) : 'erd'

  // 비Owner의 settings 직접 접근 → 개요로 강제 (서버 거부 전 UI 방어)
  useEffect(() => {
    if (activeTab === 'settings' && myWorkspaces.isSuccess && !isOwner) {
      setSearchParams({}, { replace: true })
    }
  }, [activeTab, isOwner, myWorkspaces.isSuccess, setSearchParams])

  // 마지막으로 선택한 워크스페이스 기억 — /workspaces 진입 시 이 워크스페이스 상세로 돌아온다 (S-03)
  useEffect(() => {
    setLastWorkspaceId(workspaceId)
  }, [workspaceId])

  if (workspace.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  // 존재 은닉 404 (§4.2)
  if (workspace.isError && isApiError(workspace.error) && workspace.error.status === 404) {
    return (
      <NotFoundContent
        title={t('workspace.detail.notFound.title')}
        description={t('workspace.detail.notFound.description')}
        backTo={{ to: '/workspaces', label: t('workspace.detail.notFound.back') }}
      />
    )
  }

  if (workspace.isError) {
    return <ErrorState onRetry={() => void workspace.refetch()} />
  }

  const data = workspace.data
  if (!data) return null

  const canCreateModel = myRole === 'OWNER' || myRole === 'EDITOR'

  const handleTabChange = (value: string) => {
    setSearchParams(value === 'erd' ? {} : { tab: value }, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/workspaces">{t('workspace.list.title')}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{data.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          {data.isDefault ? <Badge variant="secondary">{t('shell.defaultBadge')}</Badge> : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="erd">{t('workspace.detail.tabs.erd')}</TabsTrigger>
          <TabsTrigger value="database">{t('workspace.detail.tabs.database')}</TabsTrigger>
          <TabsTrigger value="overview">{t('workspace.detail.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="members">{t('workspace.detail.tabs.members')}</TabsTrigger>
          {isOwner ? (
            <TabsTrigger value="settings">{t('workspace.detail.tabs.settings')}</TabsTrigger>
          ) : null}
        </TabsList>
        <Separator className="my-4" />
      </Tabs>

      {activeTab === 'erd' ? (
        <ErdTab workspaceId={workspaceId} canCreate={canCreateModel} isOwner={isOwner} />
      ) : null}
      {activeTab === 'database' ? (
        <DatabaseTab workspaceId={workspaceId} canEdit={canCreateModel} />
      ) : null}
      {activeTab === 'overview' ? <OverviewTab workspace={data} /> : null}
      {activeTab === 'members' ? (
        <MembersTab workspaceId={workspaceId} workspaceName={data.name} isOwner={isOwner} />
      ) : null}
      {activeTab === 'settings' && isOwner ? (
        <SettingsTab workspace={data} workspaceId={workspaceId} />
      ) : null}
    </div>
  )
}
