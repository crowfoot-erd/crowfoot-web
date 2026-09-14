/**
 * 관계 시작 선택기 — 점(핸들) 클릭 시 캔버스를 덮는 반투명 오버레이 (05-editor/02-ui.md §4.1)
 *
 * 유형(1:N / 1:1) → 기수(까마귀발 5종 — 자식·부모 각각) → 종류(비식별 / 식별)를 고르는 순간
 * 오버레이가 닫히고 마우스를 따라 선이 움직이는 관계 대기(pending)로 넘어간다.
 * 종류 버튼이 곧 확정이므로 가장 아래에 둔다. 취소: Esc · 배경 클릭 · 닫기 버튼.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { cn } from 'cn'
import {
  CHILD_MULTIPLICITIES,
  DEFAULT_CHILD_MULTIPLICITY,
  PARENT_MULTIPLICITIES,
  coerceChildMultiplicity,
  type Multiplicity,
  type RelationshipType,
} from '@/features/editor/model/content-schema'

/** 선택기 확정 결과 — point는 종류 버튼을 클릭한 화면 좌표(임시 선 시작 위치) */
export interface RelationPick {
  type: RelationshipType
  identifying: boolean
  parentMultiplicity: Multiplicity
  childMultiplicity: Multiplicity
  point: { x: number; y: number }
}

export function RelationPickerOverlay({
  onPick,
  onCancel,
}: {
  onPick: (pick: RelationPick) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<RelationshipType | null>(null)
  // 기본값 = 기존 생성 기본값(부모 필수 · 자식은 유형별 기본) — ○ 없는 표기
  const [parentMultiplicity, setParentMultiplicity] = useState<Multiplicity>('EXACTLY_ONE')
  const [childMultiplicity, setChildMultiplicity] = useState<Multiplicity>(DEFAULT_CHILD_MULTIPLICITY.ONE_TO_MANY)

  /** 자식(N) 쪽 후보 — 유형 미선택 시 1:N 후보를 보여준다 */
  const childOptions = CHILD_MULTIPLICITIES[type ?? 'ONE_TO_MANY']

  const confirm = (identifying: boolean, event: React.MouseEvent) =>
    type &&
    onPick({
      type,
      identifying,
      parentMultiplicity,
      childMultiplicity: coerceChildMultiplicity(type, childMultiplicity),
      point: { x: event.clientX, y: event.clientY },
    })

  /** 기수 버튼 — 후보 수에 따라 2~3열. 라벨에 표기(|·○|·○<·<)를 병기한다 */
  const multiplicityButtons = (
    value: Multiplicity,
    set: (v: Multiplicity) => void,
    options: readonly Multiplicity[],
  ) => (
    <div className={cn('grid gap-2', options.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={cn(
            'rounded-md border px-2 py-1.5 text-xs font-medium',
            value === option ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
          )}
          onClick={() => set(option)}
        >
          {t(`model.editor.relationship.multiplicity_${option}`)}
        </button>
      ))}
    </div>
  )

  return (
    // 배경(어두운 레이어) 클릭 = 취소 — 카드가 stopPropagation으로 막는다
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-foreground/40" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('model.editor.relation.startMenu')}
        className="flex w-80 flex-col gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t('model.editor.relation.startMenu')}</span>
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onCancel}
            aria-label={t('model.editor.relation.cancel')}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('model.editor.relation.pickType')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['ONE_TO_MANY', 'ONE_TO_ONE'] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={type === candidate}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-semibold',
                  type === candidate
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'hover:bg-accent',
                )}
                onClick={() => {
                  setType(candidate)
                  // 유형이 바뀌면 자식 기수 후보가 달라진다 — 새 유형에서 유효한 값으로 보정한다
                  setChildMultiplicity((prev) => coerceChildMultiplicity(candidate, prev))
                }}
              >
                {candidate === 'ONE_TO_MANY'
                  ? t('model.editor.relation.oneToMany')
                  : t('model.editor.relation.oneToOne')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('model.editor.relation.multiplicity')} · {t('model.editor.relation.childSide')}
          </span>
          {multiplicityButtons(childMultiplicity, setChildMultiplicity, childOptions)}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('model.editor.relation.multiplicity')} · {t('model.editor.relation.parentSide')}
          </span>
          {multiplicityButtons(parentMultiplicity, setParentMultiplicity, PARENT_MULTIPLICITIES)}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('model.editor.relation.pickKind')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!type}
              className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              onClick={(event) => confirm(false, event)}
            >
              {t('model.editor.relation.nonIdentifying')}
            </button>
            <button
              type="button"
              disabled={!type}
              className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              onClick={(event) => confirm(true, event)}
            >
              {t('model.editor.relation.identifying')}
            </button>
          </div>
        </div>

        <span className="text-[10px] text-muted-foreground">
          {t('model.editor.relation.pickKindHint')}
        </span>
      </div>
    </div>
  )
}
