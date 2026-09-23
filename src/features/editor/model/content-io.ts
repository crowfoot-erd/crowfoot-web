/**
 * content 직렬화·역직렬화 (08-core/02-model.md §1.5.1)
 *
 * 레거시 v0(`{"tables":[],"relationships":[]}` — 1차 구현 이전 초기값)는
 * 열 때 v1로 정규화한다. 저장은 항상 v1로 기록된다.
 */
import {
  contentSchema,
  type ErdContent,
  type ErdModelData,
} from '@/features/editor/model/content-schema'

/** 빈 Canonical 문서 v1 — 생성 초기값과 동일 */
export function emptyContent(): ErdContent {
  return {
    schemaVersion: 1,
    model: { tables: [], relationships: [] },
    diagram: { nodes: {}, notes: [], areas: [], viewport: null },
  }
}

function isV0(json: unknown): json is { tables: unknown[]; relationships: unknown[] } {
  return (
    typeof json === 'object' &&
    json !== null &&
    !('schemaVersion' in json) &&
    'tables' in json &&
    Array.isArray((json as { tables: unknown }).tables)
  )
}

/** v0 → v1 정규화 — 빈 모델 + 빈 다이어그램 */
function normalizeV0(json: { tables: unknown[]; relationships: unknown[] }): ErdContent {
  return {
    schemaVersion: 1,
    model: {
      tables: json.tables as ErdModelData['tables'],
      relationships: json.relationships as ErdModelData['relationships'],
    },
    diagram: { nodes: {}, notes: [], areas: [], viewport: null },
  }
}

/** 선택성 boolean → 기수 — true(선택 ○)이면 0..1 계열, false(필수)면 정확히 1 */
function toMultiplicity(optional: unknown): 'ZERO_OR_ONE' | 'EXACTLY_ONE' {
  return optional === true ? 'ZERO_OR_ONE' : 'EXACTLY_ONE'
}

/** v1 중반 레거시 — parentOptional/childOptional boolean 관계를 기수 enum으로 변환한다.
 *  이미 기수 필드가 있으면 그대로 둔다(저장은 항상 새 형식으로 기록된다).
 *  단 과거 버전의 TWO_OR_MORE(◠<)는 표기에서 제외되어 ONE_OR_MORE(|<)로 강등한다. */
function normalizeLegacyRelationships(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const { model } = json as { model?: unknown }
  if (typeof model !== 'object' || model === null) return json
  const { relationships } = model as { relationships?: unknown }
  if (!Array.isArray(relationships)) return json
  return {
    ...json,
    model: {
      ...model,
      relationships: relationships.map((rel) => {
        if (typeof rel !== 'object' || rel === null) return rel
        const r = rel as Record<string, unknown>
        if ('parentMultiplicity' in r && 'childMultiplicity' in r) {
          if (r.parentMultiplicity === 'TWO_OR_MORE' || r.childMultiplicity === 'TWO_OR_MORE') {
            return {
              ...r,
              parentMultiplicity: r.parentMultiplicity === 'TWO_OR_MORE' ? 'ONE_OR_MORE' : r.parentMultiplicity,
              childMultiplicity: r.childMultiplicity === 'TWO_OR_MORE' ? 'ONE_OR_MORE' : r.childMultiplicity,
            }
          }
          return rel
        }
        const oneToOne = r.type === 'ONE_TO_ONE'
        return {
          ...r,
          parentMultiplicity: toMultiplicity(r.parentOptional),
          childMultiplicity:
            r.childOptional === true
              ? oneToOne
                ? 'ZERO_OR_ONE'
                : 'ZERO_OR_MORE'
              : oneToOne
                ? 'EXACTLY_ONE'
                : 'ONE_OR_MORE',
        }
      }),
    },
  }
}

/** PK → FK(PK 바로 밑) → 일반 순서로 — 렌더 규칙(에디터 블록 구조)을 문서 수화 시점에 보장한다.
 *  sort는 stable이라 같은 영역 안의 기존 순서는 유지된다. 식별 관계 FK(자식 PK 소속)는 PK 영역으로 편입된다. */
function normalizeColumnOrder(content: ErdContent): ErdContent {
  const fkIds = new Set(
    content.model.relationships.flatMap((r) => r.columnMappings.map((m) => m.childColumnId)),
  )
  for (const table of content.model.tables) {
    const pkIds = new Set(table.primaryKey?.columnIds ?? [])
    if (pkIds.size === 0 && fkIds.size === 0) continue
    const rank = (id: string) => (pkIds.has(id) ? 0 : fkIds.has(id) ? 1 : 2)
    table.columns = [...table.columns].sort((a, b) => rank(a.id) - rank(b.id))
  }
  return content
}

/**
 * content 문자열 → ErdContent. 구문 오류·스키마 불일치면 예외를 던진다
 * (호출부 — 에디터 셸이 에러 상태로 표시).
 */
export function parseContent(raw: string | null | undefined): ErdContent {
  if (!raw || raw.trim().length === 0) return emptyContent()
  const json: unknown = JSON.parse(raw)
  const candidate = isV0(json) ? normalizeV0(json) : normalizeLegacyRelationships(json)
  return normalizeColumnOrder(contentSchema.parse(candidate))
}

/** 저장 직렬화 — 저장 시에만 호출한다(키 입력마다 stringify하지 않는다 — 성능) */
export function serializeContent(content: ErdContent): string {
  return JSON.stringify(content)
}
