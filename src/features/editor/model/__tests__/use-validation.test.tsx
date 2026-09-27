/**
 * 검증 훅 재계산 흐름 테스트 (05-editor/05-validation.md §3 실행 모델)
 *
 * given: 스토어에 오류 2건(서로 다른 규칙) 문서를 수화하고 useValidationIssues를 패널 열림으로 구독
 * when: 오류 1 수정 → 디바운스 경과 → 오류 2 수정 → 디바운스 경과 (사용자 보고 흐름 —
 *       2026-09-28 "두 번째 수정이 목록에 반영되지 않고 새로고침해야 사라졌다")
 * then: 각 수정이 디바운스 뒤 목록에 반영된다(규칙별 잔여 건수 감소). 연속 수정 병합·
 *       패널 재오픈 즉시 검증도 함께 묶는다
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditorDocument } from '@/features/editor/model/content-schema'
import { useValidationIssues, VALIDATION_DEBOUNCE_MS } from '@/features/editor/model/use-validation'
import { resetEditorStore, useEditorStore } from '@/features/editor/store/editor-store'

const column = (id: string, physicalName: string) => ({
  id,
  logicalName: '항목',
  physicalName,
  dataType: 'varchar',
  length: 64,
  precision: null,
  scale: null,
  nullable: true,
  defaultValue: null,
  autoIncrement: false,
  comment: null,
})

/** 오류 2건(독립 규칙) 문서 — t1: PK·UK 이름 충돌(DUPLICATE_KEY_NAME),
 *  t2: 컬럼명 중복(DUPLICATE_COLUMN_NAME — 행 2건이지만 뿌리는 하나) */
function twoErrorDocument(): EditorDocument {
  const table = (id: string, columns: ReturnType<typeof column>[]) => ({
    id,
    logicalName: '테이블',
    physicalName: `tbl_${id}`,
    comment: null,
    columns,
    primaryKey: { name: id === 't1' ? 'k' : `pk_${id}`, columnIds: [columns[0].id] },
    uniques:
      id === 't1'
        ? [{ id: 'u1', name: 'k', columnIds: [columns[0].id] }]
        : [],
    indexes: [],
  })
  return {
    model: {
      tables: [table('t1', [column('t1:c1', 'code')]), table('t2', [column('t2:c1', 'code'), column('t2:c2', 'code')])],
      relationships: [],
    },
    diagram: { nodes: {}, notes: [], areas: [], viewport: null },
  }
}

/** error 등급 규칙 코드만 본다 — ORPHAN_TABLE 같은 경고는 관계 없는 픽스처 특성이라 잡음이 된다 */
const errorCodesOf = (issues: { code: string; level: string }[]) =>
  new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.code))

describe('useValidationIssues — 편집 재계산', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetEditorStore()
    act(() => {
      useEditorStore.getState().hydrate({ modelId: 'm1', baseVersion: 1, document: twoErrorDocument() })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('두 번째 수정도 디바운스 뒤 목록에 반영된다 — 첫 수정만 반영되고 남는 것이 없다', () => {
    const { result } = renderHook(() => useValidationIssues(true, true))

    // 패널 열림 즉시 — 오류 2종
    expect(errorCodesOf(result.current)).toEqual(new Set(['DUPLICATE_KEY_NAME', 'DUPLICATE_COLUMN_NAME']))

    // 1차 수정: t1 UK 이름 교정 → 디바운스 뒤 KEY_NAME 해소, COLUMN_NAME은 잔존
    act(() => {
      useEditorStore.getState().commit({
        type: 'uniqueKey/set',
        tableId: 't1',
        uniques: [{ id: 'u1', name: 'uk_orders_code', columnIds: ['t1:c1'] }],
      })
    })
    act(() => {
      vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS)
    })
    expect(errorCodesOf(result.current)).toEqual(new Set(['DUPLICATE_COLUMN_NAME']))

    // 2차 수정: t2 컬럼명 교정 → 디바운스 뒤 오류 없음 (사용자 보고 — 여기서 갱신이 멈춰 보였다)
    act(() => {
      useEditorStore.getState().commit({
        type: 'column/patch',
        tableId: 't2',
        columnId: 't2:c2',
        patch: { physicalName: 'group_code' },
      })
    })
    act(() => {
      vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS)
    })
    expect(result.current.filter((issue) => issue.level === 'error')).toHaveLength(0)
  })

  it('같은 디바운스 창 안의 연속 수정은 마지막 문서로 한 번에 정착한다', () => {
    const { result } = renderHook(() => useValidationIssues(true, true))
    expect(errorCodesOf(result.current).size).toBe(2)

    act(() => {
      useEditorStore.getState().commit({
        type: 'uniqueKey/set',
        tableId: 't1',
        uniques: [{ id: 'u1', name: 'uk_orders_code', columnIds: ['t1:c1'] }],
      })
    })
    // 창 안에 2차 수정이 겹친다 — 타이머는 리셋되고 최종 문서로 정착해야 한다
    act(() => {
      vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS - 100)
      useEditorStore.getState().commit({
        type: 'column/patch',
        tableId: 't2',
        columnId: 't2:c2',
        patch: { physicalName: 'group_code' },
      })
    })
    act(() => {
      vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS)
    })
    expect(result.current.filter((issue) => issue.level === 'error')).toHaveLength(0)
  })

  it('패널을 닫았다 다시 열면 즉시 전체 검증 — 대기 없이 최신 문서로 그린다', () => {
    const { result, rerender } = renderHook(({ open }: { open: boolean }) => useValidationIssues(true, open), {
      initialProps: { open: true },
    })
    expect(errorCodesOf(result.current).size).toBe(2)

    act(() => {
      useEditorStore.getState().commit({
        type: 'uniqueKey/set',
        tableId: 't1',
        uniques: [{ id: 'u1', name: 'uk_orders_code', columnIds: ['t1:c1'] }],
      })
    })
    // 닫힘→열림은 별도 커밋(실제 토글 클릭) — 디바운스 완료 전에 열면 즉시 최신 문서로 재계산
    act(() => {
      rerender({ open: false })
    })
    act(() => {
      rerender({ open: true })
    })
    expect(errorCodesOf(result.current)).toEqual(new Set(['DUPLICATE_COLUMN_NAME']))
  })
})
