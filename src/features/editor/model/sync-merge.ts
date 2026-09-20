/**
 * DB 스키마 ↔ 문서 부분 동기화 차분 (05-editor/04-dbms-engineering.md §3.3)
 *
 * 서버가 준 스키마 조회 content(리버스와 같은 규칙으로 조립된 문서 형식)을 현재 문서와 비교해
 * ErdChange 목록으로 옮긴다. 적용은 에디터의 일반 변경 파이프라인(commitAll → 실행취소 1회 →
 * 자동저장·협업 전파)을 그대로 타므로 이 모듈은 "무엇이 다른지"만 순수하게 계산한다.
 * 멱등성: 적용 시점 문서로 다시 diff하면 빈 결과가 나와야 한다(고정점 — 테스트로 lock).
 *
 * 보존 규칙(v1):
 * · diagram(색상·위치·폭·메모)은 건드리지 않는다 — node/note 변경 미발생. 테이블 삭제 시에만
 *   cascade가 노드를 치우고, 메모는 연관 해제로 남는다(changes.ts 의미론).
 * · 문서 전용 속성(테이블·컬럼 comment, 문서 전용 컬럼·인덱스, 물리명 대소문자)은 보존한다.
 * · 논리명은 DB 코멘트가 있을 때(db 논리명 ≠ 물리명 — 리버스 조립 규칙)만 덮어쓴다.
 * · defaultValue는 ''≡null로 정규화해 비교한다(드리프트 방지).
 * · 매칭 키: 테이블·컬럼 = 물리명(trim·소문자), 관계 = (자식, fkName) 우선 → 없으면 (부모→자식) 순서쌍 폴백.
 * · 리네임은 remove+add로 나타난다(물리명이 신원이라 추적 불가) — v1 한계, 실행취소로 복구된다.
 * · UK는 DB 우선 전체 교체(문서 전용 UK는 지운다) — 1:1 FK의 UK는 DB가 항상 보유하므로 자가치유된다.
 * · 인덱스는 introspection이 읽지 않아 건드리지 않는다(컬럼 삭제 시 참조 정리만 cascade가 수행).
 *
 * 단계 순서(캐스케이드 상호작용 고려 — changes.ts 의미론 기준):
 * 1. 관계 제거(DB 대응 없음·매핑 변경) → 2. 테이블 제거(cascade) → 3. 테이블 생성(키 이름 충돌 회피) →
 * 4. 테이블별 컬럼·PK·UK 확정(DB 우선) → 5. 관계 생성(중립형+patch)·스칼라 patch → 6. 존 정렬(PK→FK→일반).
 * 단계 사이사이 working 문서에 변경을 접어 판정은 항상 진행 상태 기준이다(자가치유).
 *   - relationship/remove·table/remove는 피어 FK 컬럼을 함께 지우지만, 4단계가 DB 컬럼을 다시
 *     확보하고 5단계가 fkColumns:[] 생성으로 그 컬럼을 재사용하므로 결과는 DB와 일치한다.
 *   - relationship/create는 중립형(1:N·비식별·선택)으로 만든 뒤 relationship/patch로 목표형을
 *     전환한다 — patch가 PK 병합·NOT NULL·1:1 UK·존 정렬을 재계산한다(fkColumns 재삽입 방지).
 */
import { applyChanges, newId, type ErdChange, type RelationshipPatch } from '@/features/editor/model/changes'
import type {
  EditorDocument,
  ErdColumn,
  ErdRelationship,
  ErdTable,
  ErdUniqueKey,
} from '@/features/editor/model/content-schema'
import { documentKeyNames, nextName } from '@/features/editor/model/keys'
import { contentBounds } from '@/features/editor/model/canvas-bounds'

export type SyncItemKind = 'table' | 'column' | 'primaryKey' | 'uniqueKey' | 'relationship'
export type SyncItemAction = 'add' | 'update' | 'remove'

/** 미리보기 목록 항목 — i18n은 kind·action으로, 상세는 detail 원문으로 표시한다 */
export interface SyncDiffItem {
  kind: SyncItemKind
  action: SyncItemAction
  /** 소속 테이블 물리명 — 관계는 자식 테이블 */
  table: string
  /** 대상 이름 — 컬럼 물리명·관계 fkName 등 */
  name: string
  /** update 상세 — 바뀐 필드 목록 등 원시 문자열 */
  detail: string
}

export interface SyncSummary {
  items: SyncDiffItem[]
}

export interface SyncDiff {
  changes: ErdChange[]
  summary: SyncSummary
}

/** 매칭 키 — 물리명 비교 관례(validation.ts와 동일) */
const nameKey = (s: string): string => s.trim().toLowerCase()

/** defaultValue 비교 정규화 — 빈 문자열과 null을 같은 취급 */
const normDefault = (v: string | null): string | null => (v == null || v === '' ? null : v)

/** 관계 매핑 비교용 — 부모=자식 컬럼 물리명 순서쌍 문자열(순서 유지) */
function mappingPairs(doc: EditorDocument, rel: ErdRelationship): string[] {
  const parent = doc.model.tables.find((t) => t.id === rel.parentTableId)
  const child = doc.model.tables.find((t) => t.id === rel.childTableId)
  if (!parent || !child) return []
  const pNames = new Map(parent.columns.map((c) => [c.id, nameKey(c.physicalName)]))
  const cNames = new Map(child.columns.map((c) => [c.id, nameKey(c.physicalName)]))
  return rel.columnMappings.map((m) => `${pNames.get(m.parentColumnId) ?? '?'}=${cNames.get(m.childColumnId) ?? '?'}`)
}

/** 문서에서 물리명으로 컬럼 찾기 */
function columnByName(table: ErdTable, physicalName: string): ErdColumn | undefined {
  return table.columns.find((c) => nameKey(c.physicalName) === nameKey(physicalName))
}

/** DB 테이블 → 신규 문서 테이블 — id·키 이름은 문서 네임스페이스에서 다시 만든다 */
function materializeTable(dbTable: ErdTable, doc: EditorDocument): ErdTable {
  const taken = documentKeyNames(doc.model)
  const columns: ErdColumn[] = dbTable.columns.map((c) => ({ ...c, id: newId() }))
  const freshId = new Map(dbTable.columns.map((c, i) => [c.id, columns[i]!.id]))
  let primaryKey: ErdTable['primaryKey'] = null
  if (dbTable.primaryKey) {
    const name = nextName(taken, dbTable.primaryKey.name)
    taken.add(name.toLowerCase())
    primaryKey = { name, columnIds: dbTable.primaryKey.columnIds.map((id) => freshId.get(id)!).filter(Boolean) }
  }
  const uniques: ErdUniqueKey[] = dbTable.uniques.map((u) => {
    const name = nextName(taken, u.name)
    taken.add(name.toLowerCase())
    return { id: newId(), name, columnIds: u.columnIds.map((id) => freshId.get(id)!).filter(Boolean) }
  })
  return {
    id: newId(),
    logicalName: dbTable.logicalName,
    physicalName: dbTable.physicalName,
    comment: null,
    columns,
    primaryKey,
    uniques,
    indexes: [],
  }
}

/** UK 배열 동등성 — 이름·컬럼 순서까지 같은가(id는 표현이므로 제외) */
function sameUniques(a: ErdUniqueKey[], b: ErdUniqueKey[]): boolean {
  return (
    a.length === b.length &&
    a.every((u, i) => u.name === b[i]!.name && u.columnIds.join('\0') === b[i]!.columnIds.join('\0'))
  )
}

/** db 논리명에 코멘트가 실려 있는가 — 조립 규칙상 없으면 물리명과 같다(빈 문자열도 없음 취급) */
const hasDbComment = (db: { logicalName: string; physicalName: string }): boolean =>
  db.logicalName !== '' && db.logicalName !== db.physicalName

/** 컬럼 스칼라 차분 — 논리명 규칙·defaultValue 정규화 적용. 없으면 null */
function columnPatch(cur: ErdColumn, db: ErdColumn): Partial<ErdColumn> | null {
  const patch: Partial<ErdColumn> = {}
  if (cur.dataType !== db.dataType) patch.dataType = db.dataType
  if (cur.length !== db.length) patch.length = db.length
  if (cur.precision !== db.precision) patch.precision = db.precision
  if (cur.scale !== db.scale) patch.scale = db.scale
  if (cur.nullable !== db.nullable) patch.nullable = db.nullable
  if (cur.autoIncrement !== db.autoIncrement) patch.autoIncrement = db.autoIncrement
  if (normDefault(cur.defaultValue) !== normDefault(db.defaultValue)) patch.defaultValue = normDefault(db.defaultValue)
  // 논리명 — DB 코멘트가 있을 때만 덮어쓴다. 없으면 문서 값 보존
  if (hasDbComment(db) && cur.logicalName !== db.logicalName) patch.logicalName = db.logicalName
  return Object.keys(patch).length > 0 ? patch : null
}

/** 현재 문서와 DB 문서(스키마 조회 응답)의 차분을 ErdChange로 계산한다 */
export function diffSync(current: EditorDocument, db: EditorDocument): SyncDiff {
  const changes: ErdChange[] = []
  const items: SyncDiffItem[] = []
  let working = current
  const changedTables = new Set<string>() // 6단계 존 정렬 대상

  const emit = (change: ErdChange) => {
    changes.push(change)
    working = applyChanges(working, [change])
  }
  const liveTable = (tableId: string): ErdTable | undefined =>
    working.model.tables.find((t) => t.id === tableId)
  const physOf = (doc: EditorDocument, tableId: string): string =>
    doc.model.tables.find((t) => t.id === tableId)?.physicalName ?? ''

  /* ---------- 분류 ---------- */

  const dbTableByKey = new Map(db.model.tables.map((t) => [nameKey(t.physicalName), t]))
  const dbPhysOf = (tableId: string): string => physOf(db, tableId)
  // 살아남는 테이블 — DB에도 있는 것(존재 기준은 current, 제거는 2단계에서)
  const surviving = new Set(
    current.model.tables.filter((t) => dbTableByKey.has(nameKey(t.physicalName))).map((t) => t.id),
  )

  /* ---------- 1+5단계 공용 — 관계 매칭(원천 계산) ---------- */

  interface RelPlan {
    db: ErdRelationship
    /** 짝이 있는 문서 관계 — null이면 생성. 매핑이 달라진 것도 제거 후 생성으로 간다 */
    doc: ErdRelationship | null
  }
  const relPlans: RelPlan[] = []
  const toRemove: { rel: ErdRelationship; reason: string }[] = []
  const consumedDbRelIds = new Set<string>()

  const dbRelsByChild = new Map<string, ErdRelationship[]>()
  for (const rel of db.model.relationships) {
    const childKey = nameKey(dbPhysOf(rel.childTableId))
    if (!childKey) continue
    const bucket = dbRelsByChild.get(childKey) ?? []
    bucket.push(rel)
    dbRelsByChild.set(childKey, bucket)
  }

  for (const rel of current.model.relationships) {
    // 죽는 자식 테이블에 붙은 관계는 2단계 table/remove의 cascade가 정리한다
    if (!surviving.has(rel.childTableId)) continue
    const childKey = nameKey(physOf(current, rel.childTableId))
    const candidates = dbRelsByChild.get(childKey) ?? []
    const free = candidates.filter((d) => !consumedDbRelIds.has(d.id))
    // (자식, fkName) 우선 → (부모→자식) 순서쌍 폴백 — FK가 리네임돼도 관계 신원을 유지한다
    const match =
      free.find((d) => nameKey(d.fkName) === nameKey(rel.fkName)) ??
      free.find((d) => nameKey(dbPhysOf(d.parentTableId)) === nameKey(physOf(current, rel.parentTableId)))
    if (!match) {
      toRemove.push({ rel, reason: 'DB에 없는 관계' })
      continue
    }
    consumedDbRelIds.add(match.id)
    const diverged =
      mappingPairs(current, rel).join('\0') !== mappingPairs(db, match).join('\0')
    if (diverged) {
      // 매핑이 달라지면 patch로 고칠 수 없다(columnMappings은 patch 대상이 아님) — 재생성
      toRemove.push({ rel, reason: '매핑 재지정' })
      relPlans.push({ db: match, doc: null })
    } else {
      relPlans.push({ db: match, doc: rel })
    }
  }
  for (const rel of db.model.relationships) {
    if (!consumedDbRelIds.has(rel.id)) relPlans.push({ db: rel, doc: null })
  }

  /* ---------- 1단계 — 관계 제거 ---------- */

  for (const { rel, reason } of toRemove) {
    const childPhys = physOf(current, rel.childTableId)
    const action = reason === '매핑 재지정' ? 'update' : 'remove'
    emit({ type: 'relationship/remove', relationshipId: rel.id })
    items.push({ kind: 'relationship', action, table: childPhys, name: rel.fkName, detail: reason })
  }

  /* ---------- 2단계 — 테이블 제거(DB에 없는 것 — cascade) ---------- */

  for (const t of current.model.tables) {
    if (dbTableByKey.has(nameKey(t.physicalName))) continue
    emit({ type: 'table/remove', tableId: t.id })
    items.push({ kind: 'table', action: 'remove', table: t.physicalName, name: t.physicalName, detail: 'DB에 없는 테이블' })
  }

  /* ---------- 3단계 — 테이블 생성(DB 신규 — 콘텐츠 우측 세로 배치) ---------- */

  const bounds = contentBounds(current)
  let created = 0
  for (const dbTable of db.model.tables) {
    if (current.model.tables.some((t) => nameKey(t.physicalName) === nameKey(dbTable.physicalName))) continue
    const table = materializeTable(dbTable, working)
    emit({
      type: 'table/create',
      table,
      position: { x: bounds ? bounds.maxX + 120 : 80, y: 80 + created * 320 },
    })
    created += 1
    items.push({ kind: 'table', action: 'add', table: dbTable.physicalName, name: dbTable.physicalName, detail: `컬럼 ${table.columns.length}개` })
  }

  /* ---------- 4단계 — 테이블별 동기(컬럼 확보 → PK → UK, DB 우선) ---------- */

  // 1단계 relationship/remove의 cascade로 지워졌다가 DB에 남아 재추가되는 컬럼(FK만 사라진 경우)의
  // 문서 전용 속성 보존 원천 — 원본 문서의 컬럼을 물리명 경로로 찾는다
  const currentColByPath = new Map<string, ErdColumn>()
  for (const t of current.model.tables) {
    for (const c of t.columns) currentColByPath.set(`${nameKey(t.physicalName)}\0${nameKey(c.physicalName)}`, c)
  }

  for (const dbTable of db.model.tables) {
    const cur = working.model.tables.find((t) => nameKey(t.physicalName) === nameKey(dbTable.physicalName))
    if (!cur) continue // 방어 — 2·3단계를 거치면 모든 DB 테이블이 working에 있다
    const curColumnsByKey = new Map(cur.columns.map((c) => [nameKey(c.physicalName), c]))
    const dbColumnsByKey = new Map(dbTable.columns.map((c) => [nameKey(c.physicalName), c]))

    // 컬럼 제거 — DB에 없는 것(붙은 관계는 1단계에서 이미 정리했다)
    for (const c of cur.columns) {
      if (dbColumnsByKey.has(nameKey(c.physicalName))) continue
      emit({ type: 'column/remove', tableId: cur.id, columnId: c.id })
      changedTables.add(cur.id)
      items.push({ kind: 'column', action: 'remove', table: dbTable.physicalName, name: c.physicalName, detail: 'DB에 없는 컬럼' })
    }

    // 컬럼 추가·패치 — 추가는 끝에 붙고(존 배치는 6단계), 패치는 스칼라만.
    // 재추가(cascade로 지워진 FK 컬럼)일 때 논리명·comment는 문서 값을 이어받는다
    for (const dbCol of dbTable.columns) {
      const curCol = curColumnsByKey.get(nameKey(dbCol.physicalName))
      if (!curCol) {
        const prevCol = currentColByPath.get(`${nameKey(dbTable.physicalName)}\0${nameKey(dbCol.physicalName)}`)
        emit({
          type: 'column/add',
          tableId: cur.id,
          column: {
            ...dbCol,
            id: newId(),
            logicalName: hasDbComment(dbCol)
              ? dbCol.logicalName
              : (prevCol?.logicalName ?? dbCol.logicalName),
            comment: prevCol?.comment ?? null,
          },
        })
        changedTables.add(cur.id)
        items.push({ kind: 'column', action: 'add', table: dbTable.physicalName, name: dbCol.physicalName, detail: dbCol.dataType })
        continue
      }
      const patch = columnPatch(curCol, dbCol)
      if (patch) {
        emit({ type: 'column/patch', tableId: cur.id, columnId: curCol.id, patch })
        items.push({ kind: 'column', action: 'update', table: dbTable.physicalName, name: curCol.physicalName, detail: Object.keys(patch).join(', ') })
      }
    }

    // 테이블 논리명 — 컬럼과 같은 규칙(DB 코멘트가 있을 때만). comment(메모)는 건드리지 않는다
    if (hasDbComment(dbTable) && cur.logicalName !== dbTable.logicalName) {
      emit({ type: 'table/patch', tableId: cur.id, patch: { logicalName: dbTable.logicalName } })
      items.push({ kind: 'table', action: 'update', table: dbTable.physicalName, name: dbTable.physicalName, detail: 'logicalName' })
    }

    // PK — 컬럼 확정 후 계산(참조 id가 안정화된 뒤). cascade로 다듬어진 live 상태를 본다
    const live = liveTable(cur.id)
    if (!live) continue
    const liveColumnsByKey = new Map(live.columns.map((c) => [nameKey(c.physicalName), c]))
    if (dbTable.primaryKey) {
      const columnIds: string[] = []
      for (const id of dbTable.primaryKey.columnIds) {
        const dbCol = dbTable.columns.find((c) => c.id === id)
        const liveCol = dbCol ? liveColumnsByKey.get(nameKey(dbCol.physicalName)) : undefined
        if (!liveCol) break // 참조 컬럼을 못 찾으면 PK를 건드리지 않는다(안전 방향)
        columnIds.push(liveCol.id)
      }
      if (columnIds.length === dbTable.primaryKey.columnIds.length) {
        // 자기 PK 이름은 자리를 차지하지 않는다(이름 유지 시 무한 패치 방지)
        const taken = documentKeyNames(working.model)
        if (live.primaryKey) taken.delete(live.primaryKey.name.toLowerCase())
        const desiredName = nextName(taken, dbTable.primaryKey.name)
        const same =
          live.primaryKey?.name === desiredName &&
          live.primaryKey.columnIds.join('\0') === columnIds.join('\0')
        if (!same) {
          emit({ type: 'primaryKey/set', tableId: cur.id, primaryKey: { name: desiredName, columnIds } })
          changedTables.add(cur.id)
          const pkPhys = dbTable.primaryKey.columnIds
            .map((id) => dbTable.columns.find((c) => c.id === id)?.physicalName ?? id)
            .join(', ')
          items.push({ kind: 'primaryKey', action: 'update', table: dbTable.physicalName, name: desiredName, detail: pkPhys })
        }
      }
    } else if (live.primaryKey) {
      emit({ type: 'primaryKey/set', tableId: cur.id, primaryKey: null })
      changedTables.add(cur.id)
      items.push({ kind: 'primaryKey', action: 'remove', table: dbTable.physicalName, name: live.primaryKey.name, detail: 'DB에 PK 없음' })
    }

    // UK — DB 우선 전체 교체(v1 정책). 같은 이름의 기존 UK는 id를 재사용해 표현을 유지한다
    const takenUk = documentKeyNames(working.model)
    for (const u of live.uniques) takenUk.delete(u.name.toLowerCase())
    const ownByName = new Map(live.uniques.map((u) => [u.name.toLowerCase(), u]))
    const nextUniques: ErdUniqueKey[] = []
    for (const dbU of dbTable.uniques) {
      const columnIds: string[] = []
      for (const id of dbU.columnIds) {
        const dbCol = dbTable.columns.find((c) => c.id === id)
        const liveCol = dbCol ? liveColumnsByKey.get(nameKey(dbCol.physicalName)) : undefined
        if (!liveCol) break
        columnIds.push(liveCol.id)
      }
      if (columnIds.length !== dbU.columnIds.length) continue
      const name = nextName(takenUk, dbU.name)
      takenUk.add(name.toLowerCase())
      nextUniques.push({ id: ownByName.get(nameKey(dbU.name))?.id ?? newId(), name, columnIds })
    }
    if (!sameUniques(live.uniques, nextUniques)) {
      emit({ type: 'uniqueKey/set', tableId: cur.id, uniques: nextUniques })
      items.push({
        kind: 'uniqueKey',
        action: nextUniques.length === 0 ? 'remove' : 'update',
        table: dbTable.physicalName,
        name: nextUniques.map((u) => u.name).join(', '),
        detail: `${live.uniques.length} → ${nextUniques.length}개`,
      })
    }
  }

  /* ---------- 5단계 — 관계 동기(생성은 중립형 + patch) ---------- */

  for (const plan of relPlans) {
    const dbRel = plan.db
    if (dbRel.columnMappings.length === 0) continue
    const dbParent = db.model.tables.find((t) => t.id === dbRel.parentTableId)
    const dbChild = db.model.tables.find((t) => t.id === dbRel.childTableId)
    if (!dbParent || !dbChild) continue
    const parent = working.model.tables.find((t) => nameKey(t.physicalName) === nameKey(dbParent.physicalName))
    const child = working.model.tables.find((t) => nameKey(t.physicalName) === nameKey(dbChild.physicalName))
    if (!parent || !child) continue

    // db 컬럼 id → working 컬럼 id 재매핑(물리명 경유). 못 찾으면 이 관계는 건너뛴다
    const columnMappings: ErdRelationship['columnMappings'] = []
    let mappable = true
    for (const m of dbRel.columnMappings) {
      const dbParentCol = dbParent.columns.find((c) => c.id === m.parentColumnId)
      const dbChildCol = dbChild.columns.find((c) => c.id === m.childColumnId)
      const parentCol = dbParentCol ? columnByName(parent, dbParentCol.physicalName) : undefined
      const childCol = dbChildCol ? columnByName(child, dbChildCol.physicalName) : undefined
      if (!parentCol || !childCol) {
        mappable = false
        break
      }
      columnMappings.push({ parentColumnId: parentCol.id, childColumnId: childCol.id })
    }
    if (!mappable) continue

    if (plan.doc) {
      const liveRel = working.model.relationships.find((r) => r.id === plan.doc!.id)
      if (!liveRel) continue
      const patch: RelationshipPatch = {}
      if (liveRel.name !== dbRel.name) patch.name = dbRel.name
      if (liveRel.fkName !== dbRel.fkName) patch.fkName = dbRel.fkName
      if (liveRel.type !== dbRel.type) patch.type = dbRel.type
      if (liveRel.identifying !== dbRel.identifying) patch.identifying = dbRel.identifying
      if (liveRel.parentMultiplicity !== dbRel.parentMultiplicity) patch.parentMultiplicity = dbRel.parentMultiplicity
      if (liveRel.childMultiplicity !== dbRel.childMultiplicity) patch.childMultiplicity = dbRel.childMultiplicity
      if (liveRel.onDelete !== dbRel.onDelete) patch.onDelete = dbRel.onDelete
      if (liveRel.onUpdate !== dbRel.onUpdate) patch.onUpdate = dbRel.onUpdate
      if (Object.keys(patch).length > 0) {
        emit({ type: 'relationship/patch', relationshipId: liveRel.id, patch })
        changedTables.add(child.id)
        items.push({ kind: 'relationship', action: 'update', table: child.physicalName, name: dbRel.fkName, detail: Object.keys(patch).join(', ') })
      }
      continue
    }

    // 중립형 생성(1:N·비식별·선택 — fkColumns: [] 로 4단계에서 확보한 컬럼을 재사용해 중복 삽입을 막는다)
    // 후 목표형 patch — patch가 PK 병합·NOT NULL·1:1 UK·존 정렬을 재계산한다
    const relationship: ErdRelationship = {
      id: newId(),
      name: dbRel.name,
      parentTableId: parent.id,
      childTableId: child.id,
      type: 'ONE_TO_MANY',
      identifying: false,
      parentMultiplicity: 'ZERO_OR_ONE',
      childMultiplicity: 'ZERO_OR_MORE',
      fkName: dbRel.fkName,
      columnMappings,
      onDelete: 'NO_ACTION',
      onUpdate: 'NO_ACTION',
    }
    emit({ type: 'relationship/create', relationship, fkColumns: [] })
    emit({
      type: 'relationship/patch',
      relationshipId: relationship.id,
      patch: {
        type: dbRel.type,
        identifying: dbRel.identifying,
        parentMultiplicity: dbRel.parentMultiplicity,
        childMultiplicity: dbRel.childMultiplicity,
        onDelete: dbRel.onDelete,
        onUpdate: dbRel.onUpdate,
      },
    })
    changedTables.add(child.id)
    items.push({ kind: 'relationship', action: 'add', table: child.physicalName, name: dbRel.fkName, detail: `${parent.physicalName} ← ${child.physicalName}` })
  }

  /* ---------- 6단계 — 존 정렬(PK → FK → 일반, stable) ---------- */

  for (const tableId of changedTables) {
    const table = liveTable(tableId)
    if (!table) continue
    const pkIds = new Set(table.primaryKey?.columnIds ?? [])
    const fkIds = new Set(
      working.model.relationships
        .filter((r) => r.childTableId === tableId)
        .flatMap((r) => r.columnMappings.map((m) => m.childColumnId)),
    )
    const rank = (id: string) => (pkIds.has(id) ? 0 : fkIds.has(id) ? 1 : 2)
    const desired = [...table.columns].sort((a, b) => rank(a.id) - rank(b.id))
    const columns = [...table.columns]
    desired.forEach((col, target) => {
      const from = columns.findIndex((c) => c.id === col.id)
      if (from !== target) {
        emit({ type: 'column/move', tableId, columnId: col.id, toIndex: target })
        const [moved] = columns.splice(from, 1)
        columns.splice(target, 0, moved)
      }
    })
  }

  return { changes, summary: { items } }
}
