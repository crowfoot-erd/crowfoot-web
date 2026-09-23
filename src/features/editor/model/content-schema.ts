/**
 * Canonical 문서 JSON 1차 스키마 (08-core/02-model.md §1.5.1 — schemaVersion 1)
 *
 * model(설계 내용)과 diagram(표현·레이아웃)의 분리를 content 내부 키로 유지한다.
 * 문서 내부 객체의 id는 클라이언트 생성 UUID — 서버는 스키마를 해석하지 않고
 * JSON 파싱·크기만 검증하므로 이 zod 스키마가 계약의 실행 표현이다.
 */
import { z } from 'zod'

export const RELATIONSHIP_TYPES = ['ONE_TO_ONE', 'ONE_TO_MANY'] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

/**
 * 관계 기수(cardinality) — 까마귀발 4종 (05-editor/01-core.md §6)
 * · ONE 쪽(부모): EXACTLY_ONE(|) / ZERO_OR_ONE(○|)
 * · N 쪽(자식 1:N): ZERO_OR_MORE(○<) / ONE_OR_MORE(<)
 * · 자식 1:1: EXACTLY_ONE / ZERO_OR_ONE
 * 유형별 유효값은 CHILD_MULTIPLICITIES가 정의하고 UI는 여기서만 값을 고른다.
 * 과거 버전의 TWO_OR_MORE(◠<)는 문서 수화 시 ONE_OR_MORE로 강등된다(content-io).
 */
export const MULTIPLICITIES = ['ZERO_OR_ONE', 'EXACTLY_ONE', 'ZERO_OR_MORE', 'ONE_OR_MORE'] as const
export type Multiplicity = (typeof MULTIPLICITIES)[number]

/** 부모(1) 쪽 기수 */
export const PARENT_MULTIPLICITIES = ['EXACTLY_ONE', 'ZERO_OR_ONE'] as const

/** 자식 쪽 기수 — 관계 유형별 후보 */
export const CHILD_MULTIPLICITIES: Record<RelationshipType, readonly Multiplicity[]> = {
  ONE_TO_ONE: ['EXACTLY_ONE', 'ZERO_OR_ONE'],
  ONE_TO_MANY: ['ZERO_OR_MORE', 'ONE_OR_MORE'],
}

/** 유형별 자식 기수 기본값 — 생성 초기값·유형 전환 시 보정값(양쪽 모두 필수가 기본) */
export const DEFAULT_CHILD_MULTIPLICITY: Record<RelationshipType, Multiplicity> = {
  ONE_TO_ONE: 'EXACTLY_ONE',
  ONE_TO_MANY: 'ONE_OR_MORE',
}

/** 유형 전환 등으로 자식 기수가 새 유형에 없는 값이면 기본값으로 보정한다 */
export function coerceChildMultiplicity(type: RelationshipType, value: Multiplicity): Multiplicity {
  return CHILD_MULTIPLICITIES[type].includes(value) ? value : DEFAULT_CHILD_MULTIPLICITY[type]
}

export const REFERENTIAL_ACTIONS = ['NO_ACTION', 'RESTRICT', 'CASCADE', 'SET_NULL', 'SET_DEFAULT'] as const
export type ReferentialAction = (typeof REFERENTIAL_ACTIONS)[number]

// 데이터 타입 카탈로그·DBMS 템플릿은 dbms.ts로 이관 — content에는 공용 논리 코드만 저장된다

export const columnSchema = z.object({
  id: z.string().min(1),
  logicalName: z.string(),
  physicalName: z.string().min(1),
  dataType: z.string().min(1),
  length: z.number().int().nullable(),
  precision: z.number().int().nullable(),
  scale: z.number().int().nullable(),
  nullable: z.boolean(),
  defaultValue: z.string().nullable(),
  autoIncrement: z.boolean(),
  comment: z.string().nullable(),
})
export type ErdColumn = z.infer<typeof columnSchema>

export const primaryKeySchema = z.object({
  name: z.string(),
  /** 복합 PK — 순서 보존 */
  columnIds: z.array(z.string().min(1)).min(1),
})
export type ErdPrimaryKey = z.infer<typeof primaryKeySchema>

/** 유니크 키 — 복합 지원. 이름은 문서 전체 키 네임스페이스에서 유일(keys.ts 규칙) */
export const uniqueKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 복합 키 컬럼 — 배열 순서가 키 컬럼 순서 */
  columnIds: z.array(z.string().min(1)).min(1),
})
export type ErdUniqueKey = z.infer<typeof uniqueKeySchema>

export const INDEX_ORDERS = ['ASC', 'DESC'] as const
export type IndexOrder = (typeof INDEX_ORDERS)[number]

/** 인덱스 — 복합 지원. columns 순서가 인덱스 컬럼 순서(선두 컬럼 우선), 컬럼별 정렬 포함 */
export const indexSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  columns: z
    .array(
      z.object({
        columnId: z.string().min(1),
        order: z.enum(INDEX_ORDERS),
      }),
    )
    .min(1),
})
export type ErdIndex = z.infer<typeof indexSchema>

export const tableSchema = z.object({
  id: z.string().min(1),
  logicalName: z.string(),
  physicalName: z.string().min(1),
  comment: z.string().nullable(),
  /** 배열 순서가 표시 순서 */
  columns: z.array(columnSchema),
  primaryKey: primaryKeySchema.nullable(),
  /** 유니크 키 목록 — 이 문서 v1 중반 추가. 이전 문서는 빈 배열로 정규화된다 */
  uniques: z.array(uniqueKeySchema).default([]),
  /** 인덱스 목록 — 위와 같음 */
  indexes: z.array(indexSchema).default([]),
})
export type ErdTable = z.infer<typeof tableSchema>

export const columnMappingSchema = z.object({
  /** 부모(PK 쪽) 컬럼 id */
  parentColumnId: z.string().min(1),
  /** 자식(FK 소유 쪽) 컬럼 id */
  childColumnId: z.string().min(1),
})
export type ErdColumnMapping = z.infer<typeof columnMappingSchema>

export const relationshipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 참조되는 테이블(1 쪽) */
  parentTableId: z.string().min(1),
  /** FK를 소유하는 테이블(N 쪽) */
  childTableId: z.string().min(1),
  type: z.enum(RELATIONSHIP_TYPES),
  /** 식별 관계 — 실선 / 점선 표기 (05-editor/01-core.md §6) */
  identifying: z.boolean(),
  /** 부모(1) 쪽 기수 — EXACTLY_ONE이면 FK NOT NULL. 레거시 parentOptional boolean은 content-io에서 변환한다 */
  parentMultiplicity: z.enum(MULTIPLICITIES),
  /** 자식 쪽 기수 — 유형별 유효값은 CHILD_MULTIPLICITIES 참조 */
  childMultiplicity: z.enum(MULTIPLICITIES),
  fkName: z.string(),
  columnMappings: z.array(columnMappingSchema),
  onDelete: z.enum(REFERENTIAL_ACTIONS),
  onUpdate: z.enum(REFERENTIAL_ACTIONS),
  /** 선이 붙는 면 — 레거시. 현재는 항상 배치 기준 최단 면으로 자동 계산되므로 렌더에서 무시한다 */
  sourceHandle: z.enum(['top', 'bottom', 'left', 'right']).nullish(),
  targetHandle: z.enum(['top', 'bottom', 'left', 'right']).nullish(),
})
export type ErdRelationship = z.infer<typeof relationshipSchema>

/** 테이블 강조색 프리셋 팔레트 — 정보 다이얼로그의 스와치 10색. 자유 색(hex)은 제공하지 않는다 */
export const TABLE_COLORS = ['red', 'orange', 'amber', 'yellow', 'green', 'teal', 'sky', 'blue', 'violet', 'pink'] as const
export type TableColor = (typeof TABLE_COLORS)[number]

/** 프리셋 대표색(Tailwind 500 계열) — 렌더 틴트·미니맵·스와치의 원색 */
export const TABLE_COLOR_HEX: Record<TableColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  pink: '#ec4899',
}

/** 'default'(무색) 또는 프리셋 10색 */
export const tableColorSchema = z.union([z.literal('default'), z.enum(TABLE_COLORS)])
export type TableColorValue = 'default' | TableColor

export const nodeLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  /** null = 자동 폭 */
  width: z.number().nullable(),
  /** 강조색 — 표현이므로 model이 아닌 diagram 쪽. 이전 문서는 default(무색)로 정규화된다 */
  color: tableColorSchema.default('default'),
})
export type ErdNodeLayout = z.infer<typeof nodeLayoutSchema>

/** 메모 강조색 프리셋 팔레트 — 편집 다이얼로그의 스와치. 프리셋 이외에는 "#rrggbb" 자유 색 */
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

export const NOTE_HEX_COLOR = /^#[0-9a-f]{6}$/i
/** 프리셋 이름 또는 #hex — 레거시 프리셋 값은 그대로 유효하다 */
export const noteColorSchema = z.union([z.enum(NOTE_COLORS), z.string().regex(NOTE_HEX_COLOR)])
export type NoteColorValue = NoteColor | `#${string}`
export const isNoteHex = (color: string): color is `#${string}` => NOTE_HEX_COLOR.test(color)

/** 메모 — 다이어그램 종속 (05-editor/02-ui.md §7). title·color는 레거시 문서를 위해 기본값 정규화 */
export const noteSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  text: z.string(),
  /** 헤더 밴드에 표시되는 제목 — 빈 문자열이면 자리표시자로 표시 */
  title: z.string().default(''),
  /** 포스트잇 강조색 — 프리셋(yellow…) 또는 #rrggbb */
  color: noteColorSchema.default('yellow'),
  /** 연관 테이블 — 지정하면 밴드에 배지가 붙고 자동 배치에서 이 테이블 근처에 위치한다.
   *  테이블을 드래그해 노트를 가져다 놓으면 지정되고, 테이블이 지워지면 null로 정리된다 */
  linkedTableId: z.string().nullable().default(null),
})
export type ErdNote = z.infer<typeof noteSchema>

export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
})
export type ErdViewport = z.infer<typeof viewportSchema>

/** 주제 영역 — 다이어그램 종속 배경 박스 (05-editor/02-ui.md §6, v1.13).
 *  tableIds는 모델(테이블)을 참조하는 표현 계층의 소프트 참조다 — 노트의 linkedTableId와
 *  같은 패턴(테이블 삭제 시 cascade에서 정리, 존재하지 않는 id는 무시).
 *  같은 테이블이 여러 영역에 소속될 수 있다(다중 소속 허용). */
export const areaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  /** 접기 — 멤버 테이블을 캔버스에서 숨긴다(ERDCloud·erwin 표준). 이전 문서는 펼침으로 정규화 */
  collapsed: z.boolean().default(false),
  /** 배경 틴트 — 테이블 강조색 프리셋 재사용 */
  color: tableColorSchema.default('default'),
  /** 소속 테이블 — 문서 순서 그대로 */
  tableIds: z.array(z.string().min(1)).default([]),
})
export type ErdArea = z.infer<typeof areaSchema>

export const modelDataSchema = z.object({
  tables: z.array(tableSchema),
  relationships: z.array(relationshipSchema),
})
export type ErdModelData = z.infer<typeof modelDataSchema>

export const diagramDataSchema = z.object({
  /** Record<tableId, 레이아웃> */
  nodes: z.record(z.string(), nodeLayoutSchema),
  notes: z.array(noteSchema),
  /** 주제 영역 목록 — v1.13 추가. 이전 문서는 빈 배열로 정규화된다 */
  areas: z.array(areaSchema).default([]),
  viewport: viewportSchema.nullable(),
})
export type ErdDiagramData = z.infer<typeof diagramDataSchema>

export const contentSchema = z.object({
  schemaVersion: z.literal(1),
  model: modelDataSchema,
  diagram: diagramDataSchema,
})
export type ErdContent = z.infer<typeof contentSchema>

/** 편집 중 문서 — model/diagram 묶음 (undo 스냅샷 단위).
 *  대상 DBMS는 content에 저장하지 않는다 — 문서 생성 시점의 모델 메타(database_types 코드)가
 *  원천이고 렌더 시점에 templateIdForDatabase로 파생한다(dbms.ts). */
export interface EditorDocument {
  model: ErdModelData
  diagram: ErdDiagramData
}
