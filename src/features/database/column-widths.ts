/**
 * 데이터 표의 열 너비 (09-database-manager/00-data-browser.md §5.8)
 *
 * 열을 화면 폭에 늘려 채우지 않는다. 머리글(컬럼명·논리명·타입)과 타입으로 기본 너비를 정하고,
 * 남는 폭은 표 오른쪽에 빈 채로 둔다. 사용자가 머리글 오른쪽 끝을 끌어 바꾼 너비는
 * 이 브라우저(localStorage)에 커넥션·테이블별로 기억한다 — 못 읽거나 못 써도 기본 너비로 그대로 쓴다.
 */
import { useCallback, useEffect, useState } from 'react'

import type { ColumnCategory, ColumnMeta } from '@/features/database/api'
import { splitLogicalName } from '@/features/editor/model/logical-name'

/** 끌어서 줄이거나 늘릴 수 있는 범위(px) */
export const COLUMN_WIDTH_MIN = 56
export const COLUMN_WIDTH_MAX = 640
/** 기본 너비의 범위 — 긴 머리글도 이 이상 넓게 시작하지 않는다 */
const DEFAULT_MIN = 72
const DEFAULT_MAX = 360

/** 타입별 기본 너비 — 숫자·날짜는 좁게, 텍스트는 넓게 */
const CATEGORY_BASE: Record<ColumnCategory, number> = {
  integer: 80,
  decimal: 104,
  float: 104,
  boolean: 72,
  datetime: 168,
  uuid: 296,
  character: 160,
  text: 240,
  json: 240,
  binary: 128,
  other: 140,
}

const STORAGE_PREFIX = 'crowfoot.database.column-widths:'

/** 글자 폭 어림 — 한글·한자·가나는 넓게 친다(측정 없이 정하는 기본값이라 근사로 충분하다) */
function textWidth(text: string, latin: number, wide: number): number {
  let width = 0
  for (const char of text) width += /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(char) ? wide : latin
  return width
}

/** 기본 너비 — 머리글이 다 보이는 폭과 타입별 기본 폭 중 큰 쪽(범위 안으로) */
export function defaultColumnWidth(column: ColumnMeta, logicalName?: string): number {
  const logical = logicalName ? splitLogicalName(logicalName).name : ''
  // 이름(14px) + 논리명(12px) + 타입(10px) + 사이 간격·안쪽 여백·정렬 화살표
  const header =
    textWidth(column.name, 8, 14) +
    (logical ? textWidth(logical, 7, 12) + 4 : 0) +
    textWidth(column.typeName, 6, 10) +
    4 +
    16 +
    16
  const width = Math.max(header, CATEGORY_BASE[column.category] ?? CATEGORY_BASE.other)
  return Math.round(Math.min(DEFAULT_MAX, Math.max(DEFAULT_MIN, width)))
}

export function clampColumnWidth(width: number): number {
  return Math.round(Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, width)))
}

function readStored(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    )
  } catch {
    return {}
  }
}

function writeStored(key: string, widths: Record<string, number>) {
  try {
    if (Object.keys(widths).length === 0) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(widths))
  } catch {
    // 저장소를 못 쓰는 브라우저 — 이번 화면에서만 기억한다
  }
}

/** 기억 키 — 커넥션과 테이블마다 따로 둔다 */
export function columnWidthKey(connectionId: string, objectName: string): string {
  return `${connectionId}:${objectName}`
}

export interface ColumnWidths {
  widthOf: (column: ColumnMeta) => number
  /** 끄는 동안 — 화면에만 반영한다 */
  preview: (name: string, width: number) => void
  /** 끝냈을 때 — 기억한다 */
  commit: (name: string, width: number) => void
  /** 두 번 누르기 — 기본 너비로 돌아가고 기억에서 뺀다 */
  reset: (name: string) => void
}

export function useColumnWidths(
  storageKey: string,
  labels: Record<string, string> | undefined,
): ColumnWidths {
  const [state, setState] = useState(() => ({ key: storageKey, widths: readStored(storageKey) }))
  // 다른 테이블로 옮기면 그 테이블의 기억을 읽는다
  const current = state.key === storageKey ? state.widths : readStored(storageKey)
  useEffect(() => {
    if (state.key !== storageKey) setState({ key: storageKey, widths: readStored(storageKey) })
  }, [state.key, storageKey])

  const widthOf = useCallback(
    (column: ColumnMeta) =>
      current[column.name] ?? defaultColumnWidth(column, labels?.[column.name.toLowerCase()]),
    [current, labels],
  )
  const preview = useCallback(
    (name: string, width: number) =>
      setState({ key: storageKey, widths: { ...current, [name]: clampColumnWidth(width) } }),
    [current, storageKey],
  )
  const commit = useCallback(
    (name: string, width: number) => {
      const widths = { ...readStored(storageKey), [name]: clampColumnWidth(width) }
      writeStored(storageKey, widths)
      setState({ key: storageKey, widths })
    },
    [storageKey],
  )
  const reset = useCallback(
    (name: string) => {
      const widths = { ...readStored(storageKey) }
      delete widths[name]
      writeStored(storageKey, widths)
      setState({ key: storageKey, widths })
    },
    [storageKey],
  )
  return { widthOf, preview, commit, reset }
}
