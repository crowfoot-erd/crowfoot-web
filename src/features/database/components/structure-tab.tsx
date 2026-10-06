/**
 * 구조 탭 — 컬럼·기본 키·인덱스·외래 키를 읽기 전용으로 보여 준다 (09-database-manager/00-data-browser.md §5.4)
 *
 * 고치는 버튼은 없다. 구조를 바꾸는 일은 ERD에서 하고 마이그레이션 DDL로 반영한다.
 * 에디터의 데이터 보기 탭에서는 맨 위에 문서와 다른 점(comparison)을 함께 보여 준다(§5.10).
 */
import type { ReactNode } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorState } from '@/components/error-state'
import { LogicalNameText } from '@/features/database/components/column-header'
import { useObjectStructure } from '@/features/database/hooks'
import { databaseErrorMessage } from '@/features/database/errors'

export function StructureTab({
  workspaceId,
  connectionId,
  objectName,
  comparison,
}: {
  workspaceId: string
  connectionId: string
  objectName: string
  /** 문서와 다른 점 — 에디터의 데이터 보기 탭만 준다(§5.10) */
  comparison?: ReactNode
}) {
  const { t } = useTranslation()
  const structure = useObjectStructure(workspaceId, connectionId, objectName)

  if (structure.isPending) {
    return (
      <div className="grid gap-2 p-4" aria-busy>
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    )
  }
  if (structure.isError || !structure.data) {
    return (
      <div className="p-6">
        <ErrorState
          message={databaseErrorMessage(structure.error)}
          onRetry={() => void structure.refetch()}
        />
      </div>
    )
  }
  const data = structure.data

  return (
    <div className="grid gap-6 overflow-y-auto p-4">
      {comparison ?? (
        <p className="text-xs text-muted-foreground">{t('database.structure.editInErd')}</p>
      )}
      <section aria-label={t('database.structure.columns')}>
        <h3 className="mb-2 text-sm font-medium">{t('database.structure.columns')}</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('database.structure.name')}</TableHead>
              <TableHead>{t('database.structure.type')}</TableHead>
              <TableHead>{t('database.structure.nullable')}</TableHead>
              <TableHead>{t('database.structure.default')}</TableHead>
              <TableHead>{t('database.structure.comment')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.columns.map((column) => (
              <TableRow key={column.name}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {column.primaryKey ? (
                      <span title={t('database.structure.primaryKey')} className="inline-flex">
                        <KeyRound
                          aria-label={t('database.structure.primaryKey')}
                          className="size-3.5 text-amber-500"
                        />
                      </span>
                    ) : null}
                    {column.name}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {column.typeName}
                  {column.autoIncrement ? (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {t('database.structure.autoIncrement')}
                    </Badge>
                  ) : null}
                  {column.generated ? (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {t('database.structure.generated')}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{column.nullable ? t('common.yes') : t('common.no')}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {column.defaultValue ?? ''}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {/* 코멘트는 ERD 논리명 관례를 따른다 — `-----` 앞부분만, 설명은 툴팁(05-editor/01-core.md §3.3) */}
                  {column.comment ? (
                    <LogicalNameText
                      value={column.comment}
                      descriptionId={`structure-comment-${column.name}`}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {data.kind === 'TABLE' ? (
        <>
          <section aria-label={t('database.structure.indexes')}>
            <h3 className="mb-2 text-sm font-medium">{t('database.structure.indexes')}</h3>
            {data.indexes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('database.structure.none')}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {data.indexes.map((index) => (
                  <li key={index.name} className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{index.name}</code>
                    {index.unique ? (
                      <Badge variant="outline" className="text-[10px]">
                        {t('database.structure.unique')}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground">({index.columns.join(', ')})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t('database.structure.foreignKeys')}>
            <h3 className="mb-2 text-sm font-medium">{t('database.structure.foreignKeys')}</h3>
            {data.foreignKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('database.structure.none')}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {data.foreignKeys.map((foreignKey) => (
                  <li key={foreignKey.name} className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{foreignKey.name}</code>
                    <span className="text-muted-foreground">
                      ({foreignKey.columns.join(', ')}) → {foreignKey.referencedObject} (
                      {foreignKey.referencedColumns.join(', ')})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t('database.structure.referencedBy')}>
            <h3 className="mb-2 text-sm font-medium">{t('database.structure.referencedBy')}</h3>
            {(data.referencedBy ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('database.structure.none')}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {(data.referencedBy ?? []).map((reference) => (
                  <li
                    key={`${reference.object}:${reference.name}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <code className="text-xs">{reference.name}</code>
                    <span className="text-muted-foreground">
                      {reference.object} ({reference.columns.join(', ')}) → (
                      {reference.referencedColumns.join(', ')})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
