/**
 * 관계 다이얼로그 — 생성(연결 직후)·편집(엣지 더블클릭·컨텍스트 메뉴)
 *
 * 생성: 부모 PK 기반 FK 컬럼 미리보기를 보여주고 확인 시 relationship/create 1커밋
 * (관계 + FK 컬럼 + 식별 관계 PK 포함 — undo 1스택). 부모/자식 스왑 가능.
 * 편집: 속성만 patch(컬럼 매핑 재구성은 후속 Phase).
 * 협업(v1.17): 열려 있는 동안 Edit Session Lock을 잡는다(useEditLock) — 편집은 관계,
 * 생성은 FK가 붙는 자식 테이블이 락 대상이다(서버 ChangeTargets 매핑과 같은 규칙).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { buildRelationship } from '@/features/editor/model/relationship'
import type { RelationshipPatch } from '@/features/editor/model/changes'
import {
  CHILD_MULTIPLICITIES,
  DEFAULT_CHILD_MULTIPLICITY,
  PARENT_MULTIPLICITIES,
  REFERENTIAL_ACTIONS,
  RELATIONSHIP_TYPES,
  coerceChildMultiplicity,
  type ErdColumn,
  type ErdRelationship,
  type ErdTable,
  type Multiplicity,
  type ReferentialAction,
  type RelationshipType,
} from '@/features/editor/model/content-schema'
import { useEditLock } from '@/features/editor/collab-locks'

export interface RelationshipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 생성 모드 — 연결된 두 테이블 (둘 다 있어야 생성 모드) */
  parent: ErdTable | null
  child: ErdTable | null
  /** 편집 모드 — 기존 관계 (parent/child 대신 지정) */
  relationship?: ErdRelationship | null
  /** 생성 확정 — relationship/create 커밋 재료 */
  onConfirmCreate: (payload: { relationship: ErdRelationship; fkColumns: ErdColumn[] }) => void
  /** 편집 확정 — relationship/patch 커밋 재료 */
  onConfirmPatch: (relationshipId: string, patch: RelationshipPatch) => void
  /** 관계 삭제 확정 — 편집 모드 푸터 버튼 (undo 1스택) */
  onRemove?: (relationshipId: string) => void
  /** 같은 부모→자식 관계가 이미 있는지 — 스왑 후에도 중복 생성을 막는다 */
  isDuplicate?: (parentTableId: string, childTableId: string) => boolean
}

interface RelationFormState {
  type: RelationshipType
  identifying: boolean
  parentMultiplicity: Multiplicity
  childMultiplicity: Multiplicity
  fkName: string
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
}

/** 줄의 자연 텍스트 폭 — truncate된 요소의 scrollWidth는 max(텍스트 폭, 현재 상자 폭)이라
 *  상자가 넓어진 뒤 다시 재면 값이 자라난다(재측정마다 +α 래칫). width를 max-content로
 *  잠깐 바꿔 읽고 되돌린다 — 측정이 멱등해져 다이얼로그 폭이 내용을 따라간다 */
function naturalTextWidth(el: HTMLElement): number {
  const prev = el.style.width
  el.style.width = 'max-content'
  const width = el.scrollWidth
  el.style.width = prev
  return width
}

/** 캔버스로 텍스트 폭 측정 — 대상 요소의 실제 계산 폰트를 그대로 쓴다. input은 기본
 *  클래스의 md:text-sm이 text-xs보다 캔버스 순서에서 뒤라 실제 렌더 폰트(14px)와
 *  미러 span(12px)이 어긋난다 — DOM 미러 대신 이 방식으로 잰다 */
function measuredTextWidth(text: string, font: string): number {
  if (text === '') return 0
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return 0 // 캔버스 불가 환경(jsdom) — 0이면 요구 폭이 바닥에 기여하지 않는다
  ctx.font = font
  return Math.ceil(ctx.measureText(text).width)
}

export function RelationshipDialog({
  open,
  onOpenChange,
  parent,
  child,
  relationship,
  onConfirmCreate,
  onConfirmPatch,
  onRemove,
  isDuplicate,
}: RelationshipDialogProps) {
  const { t } = useTranslation()
  const isCreate = Boolean(parent && child) && !relationship
  // 다이얼로그 수명 락 — 편집은 관계, 생성은 자식 테이블(FK가 붙는 쪽)
  const lockTargetId = relationship?.id ?? child?.id ?? null
  const foreignLock = useEditLock(relationship ? 'relationship' : 'table', lockTargetId, open)
  const locked = foreignLock !== null

  const [swapped, setSwapped] = useState<ErdTable | null>(null)
  const [state, setState] = useState<RelationFormState>({
    type: 'ONE_TO_MANY',
    identifying: false,
    parentMultiplicity: 'EXACTLY_ONE',
    childMultiplicity: DEFAULT_CHILD_MULTIPLICITY.ONE_TO_MANY,
    fkName: '',
    onDelete: 'NO_ACTION',
    onUpdate: 'NO_ACTION',
  })

  // 모드 진입마다 초기화 — 생성: 기본값 / 편집: 기존 관계 값
  useEffect(() => {
    if (!open) return
    setSwapped(null)
    if (relationship) {
      setState({
        type: relationship.type,
        identifying: relationship.identifying,
        parentMultiplicity: relationship.parentMultiplicity,
        childMultiplicity: relationship.childMultiplicity,
        fkName: relationship.fkName,
        onDelete: relationship.onDelete,
        onUpdate: relationship.onUpdate,
      })
    } else {
      setState({
        type: 'ONE_TO_MANY',
        identifying: false,
        parentMultiplicity: 'EXACTLY_ONE',
        childMultiplicity: DEFAULT_CHILD_MULTIPLICITY.ONE_TO_MANY,
        fkName: '',
        onDelete: 'NO_ACTION',
        onUpdate: 'NO_ACTION',
      })
    }
  }, [open, relationship])

  // 스왑(생성 모드) — swapped는 '원래 자식'(새 부모)을 가리킨다
  const effectiveParent = swapped ?? parent
  const effectiveChild = swapped ? parent : child

  /** 생성 미리보기 — 현재 입력값으로 FK를 만들어 본다 */
  const preview = useMemo(() => {
    if (!isCreate || !effectiveParent || !effectiveChild) return null
    return buildRelationship({
      parentTable: effectiveParent,
      childTable: effectiveChild,
      type: state.type,
      identifying: state.identifying,
      parentMultiplicity: state.parentMultiplicity,
      childMultiplicity: state.childMultiplicity,
      fkName: state.fkName.trim() === '' ? undefined : state.fkName.trim(),
      onDelete: state.onDelete,
      onUpdate: state.onUpdate,
    })
  }, [isCreate, effectiveParent, effectiveChild, state])

  const defaultFkName =
    effectiveParent && effectiveChild
      ? `fk_${effectiveChild.physicalName.toLowerCase()}_${effectiveParent.physicalName.toLowerCase()}`
      : ''

  const canConfirm = isCreate ? preview?.ok === true : true

  const handleConfirm = () => {
    if (isCreate && preview?.ok && effectiveParent && effectiveChild) {
      // 스왑으로 방향이 바뀌어도 중복 관계는 확정하지 않는다
      if (isDuplicate?.(effectiveParent.id, effectiveChild.id)) {
        toast.error(
          t('model.editor.relationship.duplicate', {
            parent: effectiveParent.physicalName,
            child: effectiveChild.physicalName,
          }),
        )
        return
      }
      onConfirmCreate({ relationship: preview.relationship, fkColumns: preview.fkColumns })
      onOpenChange(false)
      return
    }
    if (relationship) {
      const patch: RelationshipPatch = {
        type: state.type,
        identifying: state.identifying,
        parentMultiplicity: state.parentMultiplicity,
        childMultiplicity: state.childMultiplicity,
        fkName: state.fkName.trim() === '' ? relationship.fkName : state.fkName.trim(),
        onDelete: state.onDelete,
        onUpdate: state.onUpdate,
      }
      onConfirmPatch(relationship.id, patch)
      onOpenChange(false)
    }
  }

  const fkNameValue = state.fkName || defaultFkName

  const descriptionText =
    isCreate && effectiveParent && effectiveChild
      ? `${effectiveParent.physicalName} (1) → ${effectiveChild.physicalName} (N)`
      : (relationship?.fkName ?? '')

  /** 설명 줄(헤더·부모/자식 테이블 정보)과 FK 이름 값이 길면 다이얼로그 폭을 그에 맞춰
   *  넓힌다 — 448(sm:max-w-md 바닥)~1280(뷰포트 한도) 범위. 그래도 못 담는 극단값은
   *  truncate가 다이얼로그 폭을 지킨다(전체 텍스트는 title 호버).
   *  FK 이름 입력칸은 2열 그리드의 절반 폭이라 값 전체가 보이려면 (값+칸 장식) 폭의
   *  2배+여백이 필요하다 — 입력칸의 계산 폰트로 캔버스 측정한다.
   *  radix Portal이 본문을 첫 커밋보다 늦게 마운트해 useLayoutEffect 시점엔 노드가
   *  없다 — ref가 붙는 시점마다 재측정한다(마지막 부착이 전체 줄을 본다) */
  const widthDriverRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const fkInputRef = useRef<HTMLInputElement | null>(null)
  const [dialogMaxWidth, setDialogMaxWidth] = useState<number | null>(null)
  const applyContentWidth = useCallback((fkValue: string) => {
    const widest = widthDriverRefs.current.reduce(
      (max, el) => Math.max(max, el ? naturalTextWidth(el) : 0),
      0,
    )
    let fkRequired = 0
    const inputEl = fkInputRef.current
    if (inputEl) {
      const cs = getComputedStyle(inputEl)
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const chrome = [cs.paddingLeft, cs.paddingRight, cs.borderLeftWidth, cs.borderRightWidth].reduce(
        (sum, value) => sum + (parseFloat(value) || 0),
        0,
      )
      // +2 = 캔버스 측정 오차 여유. ×2 = 절반 폭 칸, +44 = 열 간격 12 + 다이얼로그 패딩 32
      fkRequired = (measuredTextWidth(fkValue, font) + chrome + 2) * 2 + 44
    }
    const cap = Math.min(1280, window.innerWidth - 32)
    const target = Math.min(Math.max(widest + 32, fkRequired, 448), cap)
    const next = target > 448 ? target : null
    // 같은 값이면 재렌더링하지 않는다 — 측정이 멱등하므로 ref 콜백이 흔들려도 수렴한다
    setDialogMaxWidth((prev) => (prev === next ? prev : next))
  }, [])
  const setWidthDriver = (index: number) => (el: HTMLParagraphElement | null) => {
    widthDriverRefs.current[index] = el
    if (el != null) applyContentWidth(fkNameValue)
  }
  const setFkInput = (el: HTMLInputElement | null) => {
    fkInputRef.current = el
    if (el != null) applyContentWidth(fkNameValue)
  }
  useLayoutEffect(() => {
    if (!open) setDialogMaxWidth(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        style={dialogMaxWidth != null ? { maxWidth: `${dialogMaxWidth}px` } : undefined}
      >
        <DialogHeader>
          <DialogTitle>{t(isCreate ? 'model.editor.relationship.createTitle' : 'model.editor.relationship.editTitle')}</DialogTitle>
          <DialogDescription ref={setWidthDriver(0)} className="truncate" title={descriptionText}>
            {descriptionText}
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <p data-testid="edit-lock-notice" className="text-xs text-amber-600 dark:text-amber-400">
            {t('model.editor.collab.lockBlocked', { name: foreignLock.userName })}
          </p>
        ) : null}

        <div className="grid gap-4">
          {isCreate ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p ref={setWidthDriver(1)} className="truncate">
                  <span className="text-muted-foreground">{t('model.editor.relationship.parent')}: </span>
                  <span className="font-medium">{effectiveParent?.physicalName}</span>
                </p>
                <p ref={setWidthDriver(2)} className="truncate">
                  <span className="text-muted-foreground">{t('model.editor.relationship.child')}: </span>
                  <span className="font-medium">{effectiveChild?.physicalName}</span>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSwapped((prev) => (prev ? null : child))}
                disabled={!parent || !child}
                title={t('model.editor.relationship.swap')}
              >
                <ArrowLeftRight aria-hidden />
                {t('model.editor.relationship.swap')}
              </Button>
            </div>
          ) : effectiveParent && effectiveChild ? (
            // 편집 — 어떤 테이블 ↔ 어떤 테이블 관계인지 읽기 전용으로 보여준다 (스왑 불가)
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p ref={setWidthDriver(3)} className="truncate">
                <span className="text-muted-foreground">{t('model.editor.relationship.parent')}: </span>
                <span className="font-medium">{effectiveParent.physicalName}</span>
                {effectiveParent.logicalName !== effectiveParent.physicalName ? (
                  <span className="text-muted-foreground"> ({effectiveParent.logicalName})</span>
                ) : null}
              </p>
              <p ref={setWidthDriver(4)} className="truncate">
                <span className="text-muted-foreground">{t('model.editor.relationship.child')}: </span>
                <span className="font-medium">{effectiveChild.physicalName}</span>
                {effectiveChild.logicalName !== effectiveChild.physicalName ? (
                  <span className="text-muted-foreground"> ({effectiveChild.logicalName})</span>
                ) : null}
              </p>
            </div>
          ) : null}

          {isCreate ? (
            <div className="rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {t('model.editor.relationship.fkPreview')}
              </p>
              {preview?.ok ? (
                <ul className="max-h-32 overflow-y-auto p-2 text-xs">
                  {preview.fkColumns.map((column) => (
                    <li key={column.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5">
                      <span className="font-mono">{column.physicalName}</span>
                      <span className="text-muted-foreground">
                        {column.dataType}
                        {column.length !== null ? `(${column.length})` : ''}
                        {column.precision !== null ? `(${column.precision},${column.scale ?? 0})` : ''}
                        {column.nullable ? '' : ' · NOT NULL'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-xs text-destructive">{t('model.editor.relationship.noPk')}</p>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="relationship-type">{t('model.editor.relationship.type')}</Label>
              <Select
                value={state.type}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    type: value as RelationshipType,
                    // 유형이 바뀌면 자식 기수 후보가 달라진다 — 유효한 값으로 보정
                    childMultiplicity: coerceChildMultiplicity(value as RelationshipType, prev.childMultiplicity),
                  }))
                }
              >
                <SelectTrigger id="relationship-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`model.editor.relationship.type_${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="relationship-fk-name">{t('model.editor.relationship.fkName')}</Label>
              <Input
                id="relationship-fk-name"
                ref={setFkInput}
                value={fkNameValue}
                onChange={(event) => setState((prev) => ({ ...prev, fkName: event.target.value }))}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <label className="flex items-center justify-between gap-2 text-sm" htmlFor="relationship-identifying">
              {t('model.editor.relationship.identifying')}
              <Switch
                id="relationship-identifying"
                checked={state.identifying}
                onCheckedChange={(checked) => setState((prev) => ({ ...prev, identifying: checked }))}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="relationship-parent-multiplicity">
                  {t('model.editor.relationship.parentMultiplicity')}
                </Label>
                <Select
                  value={state.parentMultiplicity}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, parentMultiplicity: value as Multiplicity }))
                  }
                >
                  <SelectTrigger id="relationship-parent-multiplicity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENT_MULTIPLICITIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`model.editor.relationship.multiplicity_${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="relationship-child-multiplicity">
                  {t('model.editor.relationship.childMultiplicity')}
                </Label>
                <Select
                  value={state.childMultiplicity}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, childMultiplicity: value as Multiplicity }))
                  }
                >
                  <SelectTrigger id="relationship-child-multiplicity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHILD_MULTIPLICITIES[state.type].map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`model.editor.relationship.multiplicity_${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {state.identifying ? (
              <p className="text-xs text-muted-foreground">{t('model.editor.relationship.identifyingHint')}</p>
            ) : state.type === 'ONE_TO_ONE' ? (
              <p className="text-xs text-muted-foreground">{t('model.editor.relationship.uniqueHint')}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('model.editor.relationship.optionalityHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('model.editor.relationship.onDelete')}</Label>
              <Select
                value={state.onDelete}
                onValueChange={(value) => setState((prev) => ({ ...prev, onDelete: value as ReferentialAction }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENTIAL_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {t(`model.editor.relationship.action_${action}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('model.editor.relationship.onUpdate')}</Label>
              <Select
                value={state.onUpdate}
                onValueChange={(value) => setState((prev) => ({ ...prev, onUpdate: value as ReferentialAction }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENTIAL_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {t(`model.editor.relationship.action_${action}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          {relationship && onRemove ? (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={locked}
              onClick={() => {
                onRemove(relationship.id)
                onOpenChange(false)
              }}
            >
              {t('model.editor.relationship.remove')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm || locked}>
            {t(isCreate ? 'common.create' : 'common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
