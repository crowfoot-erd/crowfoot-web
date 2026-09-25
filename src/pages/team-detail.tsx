/**
 * S-08 팀 상세 (storyboard 02-user §8)
 *
 * - 개요(myRole 분기)·멤버 표
 * - Owner만: 팀원 추가·제외(본인 행 미노출)·정보 변경·해체
 * - 해체는 Workspace에 영향 없음(팀 부여 멤버십만 회수)
 * - 404 TEAM_NOT_FOUND → §4.2
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Loader2, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { NotFoundContent } from '@/components/not-found-content'
import { isApiError } from '@/api/client'
import type { TeamMember } from '@/api/types'
import {
  AddTeamMemberDialog,
  useDissolveTeam,
  useRemoveTeamMember,
  useTeam,
  useTeamMembers,
  useUpdateTeam,
} from '@/features/teams'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/result-code'

interface TeamSettingsFormValues {
  name: string
  description: string
}

export function TeamDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { teamId = '' } = useParams()

  const team = useTeam(teamId)
  const members = useTeamMembers(teamId)
  const updateMutation = useUpdateTeam(teamId)
  const dissolveMutation = useDissolveTeam()
  const removeMutation = useRemoveTeamMember(teamId)

  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)
  const [dissolveOpen, setDissolveOpen] = useState(false)

  const isOwner = team.data?.myRole === 'OWNER'

  const form = useForm<TeamSettingsFormValues>({
    defaultValues: { name: team.data?.name ?? '', description: team.data?.description ?? '' },
    values: team.data
      ? { name: team.data.name, description: team.data.description ?? '' }
      : undefined,
  })

  const name = form.watch('name')
  const description = form.watch('description')
  const dirty =
    !!team.data &&
    (name.trim() !== team.data.name || description.trim() !== (team.data.description ?? ''))

  if (team.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (team.isError && isApiError(team.error) && team.error.status === 404) {
    return (
      <NotFoundContent
        title={t('team.detail.notFound.title')}
        description={t('team.detail.notFound.description')}
        backTo={{ to: '/teams', label: t('team.detail.notFound.back') }}
      />
    )
  }

  if (team.isError || !team.data) {
    return <ErrorState onRetry={() => void team.refetch()} />
  }

  const data = team.data

  const handleUpdate = form.handleSubmit((values) => {
    const body: Partial<{ name: string; description: string | null }> = {}
    if (values.name.trim() !== data.name) body.name = values.name.trim()
    if (values.description.trim() !== (data.description ?? '')) {
      body.description = values.description.trim() || null
    }
    updateMutation.mutate(body, {
      onSuccess: () => toast.success(t('team.detail.settings.saveSuccess')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  })

  const handleRemoveMember = () => {
    if (!removeTarget) return
    removeMutation.mutate(removeTarget.userId, {
      onSuccess: () => {
        toast.success(t('team.members.removeSuccess'))
        setRemoveTarget(null)
      },
      onError: (error) => {
        setRemoveTarget(null)
        toast.error(errorMessage(error))
        if (isApiError(error) && error.resultCode === 'TEAM_MEMBER_NOT_FOUND') {
          void members.refetch()
        }
      },
    })
  }

  const handleDissolve = () => {
    dissolveMutation.mutate(teamId, {
      onSuccess: () => {
        setDissolveOpen(false)
        toast.success(t('team.detail.settings.dissolveSuccess'))
        navigate('/teams')
      },
      onError: (error) => {
        toast.error(errorMessage(error))
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/teams">{t('team.list.title')}</Link>
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
          {isOwner ? <Badge variant="secondary">{t('team.list.ownerBadge')}</Badge> : null}
        </div>
      </div>

      {/* 개요 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('common.overview')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4">
            <span className="text-muted-foreground">{t('team.detail.fields.name')}</span>
            <span className="min-w-0 break-words">{data.name}</span>
          </div>
          <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4">
            <span className="text-muted-foreground">{t('team.detail.fields.description')}</span>
            <span className="min-w-0 break-words">{data.description ?? t('common.none')}</span>
          </div>
          <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4">
            <span className="text-muted-foreground">{t('team.detail.fields.memberCount')}</span>
            <span>{t('common.memberCount', { count: data.memberCount })}</span>
          </div>
          <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-4">
            <span className="text-muted-foreground">{t('team.detail.fields.createdAt')}</span>
            <span>{formatDate(data.createdAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 멤버 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t('team.members.title')}
            {members.data ? ` (${members.data.totalCount})` : ''}
          </h2>
          {isOwner ? (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus aria-hidden />
              {t('team.members.addButton')}
            </Button>
          ) : null}
        </div>

        {members.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : members.isError ? (
          <ErrorState onRetry={() => void members.refetch()} />
        ) : members.data && members.data.items.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.members.table.name')}</TableHead>
                  <TableHead>{t('team.members.table.email')}</TableHead>
                  <TableHead className="w-24">{t('team.members.table.role')}</TableHead>
                  <TableHead className="w-32">{t('team.members.table.addedBy')}</TableHead>
                  <TableHead className="w-28">{t('team.members.table.addedAt')}</TableHead>
                  {isOwner ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.items.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <Badge variant={member.teamRole === 'OWNER' ? 'default' : 'secondary'}>
                        {t(`common.roleShort.${member.teamRole}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.addedBy?.name ?? t('workspace.members.grantedOnCreation')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(member.addedAt)}</TableCell>
                    {/* 팀 Owner 본인 행에는 제외 미노출 (서버도 400으로 안전망) */}
                    {isOwner ? (
                      <TableCell>
                        {member.teamRole === 'OWNER' ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(member)}
                          >
                            {t('team.members.remove')}
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState illustration="team" title={t('team.members.empty')} />
        )}
      </section>

      {/* 정보 변경·해체 — Owner만 */}
      {isOwner ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('common.settings')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={handleUpdate} className="grid max-w-lg gap-4" noValidate>
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
                      {t('team.detail.settings.save')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                {t('team.detail.settings.dangerZone')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-lg text-sm text-muted-foreground">
                {t('team.detail.settings.dissolveDescription', { name: data.name })}
              </p>
              <Button type="button" variant="destructive" onClick={() => setDissolveOpen(true)}>
                {t('team.detail.settings.dissolveButton')}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}

      {isOwner ? <AddTeamMemberDialog open={addOpen} onOpenChange={setAddOpen} teamId={teamId} /> : null}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title={t('team.members.removeTitle')}
        description={t('team.members.removeDescription', { name: removeTarget?.name ?? '' })}
        confirmLabel={t('team.members.remove')}
        destructive
        confirming={removeMutation.isPending}
        onConfirm={handleRemoveMember}
      />

      <ConfirmDialog
        open={dissolveOpen}
        onOpenChange={setDissolveOpen}
        title={t('team.detail.settings.dissolveTitle')}
        description={t('team.detail.settings.dissolveDescription', { name: data.name })}
        confirmLabel={t('team.detail.settings.dissolveConfirm')}
        destructive
        confirming={dissolveMutation.isPending}
        onConfirm={handleDissolve}
      />
    </div>
  )
}
