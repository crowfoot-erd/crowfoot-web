/**
 * DBMS 템플릿 — 공용 논리 타입 카탈로그 + DBMS별 물리 타입 매핑 (05-editor/01-core.md §17)
 *
 * content에는 **공용 논리 타입 코드**만 저장된다(스키마 안정성 — DBMS를 바꿔도 문서
 * 재작성이 불필요하고 협업·버전 호환이 유지된다). 물리 표기는 저장 시점이 아니라
 * 렌더·DDL 생성 시점에 템플릿 매핑으로 바꾼다(erwin의 논리/물리 분리와 같은 원리).
 *
 * 새 DBMS 지원은 `DBMS_TEMPLATES`에 항목을 추가하는 것으로 끝난다 —
 * 타입 매핑·자동 증가 방식이 그 템플릿 안에 다 담긴다.
 */

/** 타입 범주 — 자동 증간 가능 여부 등 규칙은 코드가 아니라 범주로 판정한다 */
export type DataTypeCategory =
  | 'integer'
  | 'decimal'
  | 'float'
  | 'character'
  | 'text'
  | 'datetime'
  | 'boolean'
  | 'json'
  | 'uuid'
  | 'binary'

export interface DataTypeSpec {
  /** 공용 논리 코드 — content에 저장되는 값 */
  code: string
  category: DataTypeCategory
  /** 길이(n) 지정 가능 */
  length?: boolean
  /** 정밀도+스케일(p,s) 지정 가능 */
  precision?: boolean
}

/** 공용 타입 카탈로그 — DBMS 공통분모의 논리 타입 (1차 하드코딩, 2차 Domain로 확장) */
export const DATA_TYPES: DataTypeSpec[] = [
  { code: 'INT', category: 'integer' },
  { code: 'BIGINT', category: 'integer' },
  { code: 'SMALLINT', category: 'integer' },
  { code: 'TINYINT', category: 'integer' },
  { code: 'DECIMAL', category: 'decimal', precision: true },
  { code: 'NUMERIC', category: 'decimal', precision: true },
  { code: 'FLOAT', category: 'float' },
  { code: 'DOUBLE', category: 'float' },
  { code: 'CHAR', category: 'character', length: true },
  { code: 'VARCHAR', category: 'character', length: true },
  { code: 'TEXT', category: 'text' },
  { code: 'BOOLEAN', category: 'boolean' },
  { code: 'DATE', category: 'datetime' },
  { code: 'TIME', category: 'datetime' },
  { code: 'DATETIME', category: 'datetime' },
  { code: 'TIMESTAMP', category: 'datetime' },
  { code: 'JSON', category: 'json' },
  { code: 'UUID', category: 'uuid' },
  { code: 'BLOB', category: 'binary' },
]

export function dataTypeSpec(code: string): DataTypeSpec | undefined {
  return DATA_TYPES.find((t) => t.code === code)
}

/** 자동 증가(AI) 가능 타입 — 정수 범주만 (PK와 조합해 UI가 판정한다) */
export function isAutoIncrementType(code: string): boolean {
  return dataTypeSpec(code)?.category === 'integer'
}

/** 자동 증가의 DBMS별 실현 방식 — 2차 DDL 생성이 이 값을 사용한다 */
export type AutoIncrementKind =
  /** 컬럼 속성 — MySQL `AUTO_INCREMENT`, MSSQL `IDENTITY(1,1)` */
  | 'attribute'
  /** 타입 자체 — PostgreSQL `SERIAL`/`GENERATED ... AS IDENTITY` */
  | 'type'
  /** 별도 시퀀스/트리거 — Oracle */
  | 'sequence'

export interface DbmsTemplate {
  id: string
  /** 표시 라벨 — MySQL 등 고유명. 공용(common)은 번들 문구(model.editor.dbms.common)를 쓰므로 없다 */
  label?: string
  /** 공용 논리 코드 → 이 DBMS의 물리 표기. 없는 코드는 공용 코드를 그대로 쓴다 */
  types: Record<string, string>
  autoIncrement: AutoIncrementKind
}

export const DBMS_TEMPLATES: DbmsTemplate[] = [
  {
    id: 'common',
    types: {},
    autoIncrement: 'attribute',
  },
  {
    id: 'mysql',
    label: 'MySQL',
    types: {
      BOOLEAN: 'TINYINT(1)',
      UUID: 'CHAR(36)',
    },
    autoIncrement: 'attribute',
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    types: {
      INT: 'INTEGER',
      TINYINT: 'SMALLINT', // PG에 tinyint는 없다 — SMALLINT가 같은 역할(라벨 중복은 옵션에서 제거된다)
      // 시각표기 타입 2종 — DATETIME=TIMESTAMP(타임존 없음), TIMESTAMP=TIMESTAMPTZ(UTC 순간)로
      // 의미가 대응한다. 라벨이 서로 달라 PG 드롭다운에서 중복이 없다
      DATETIME: 'TIMESTAMP',
      TIMESTAMP: 'TIMESTAMPTZ',
      DOUBLE: 'DOUBLE PRECISION',
      FLOAT: 'REAL',
      BLOB: 'BYTEA',
    },
    autoIncrement: 'type',
  },
  {
    id: 'oracle',
    label: 'Oracle',
    types: {
      BIGINT: 'NUMBER(19)',
      SMALLINT: 'NUMBER(5)',
      TINYINT: 'NUMBER(3)',
      DECIMAL: 'NUMBER',
      NUMERIC: 'NUMBER',
      VARCHAR: 'VARCHAR2',
      TEXT: 'CLOB',
      BOOLEAN: 'NUMBER(1)',
      TIME: 'TIMESTAMP',
      DATETIME: 'TIMESTAMP',
      JSON: 'CLOB',
      UUID: 'RAW(16)',
      FLOAT: 'BINARY_FLOAT',
      DOUBLE: 'BINARY_DOUBLE',
    },
    autoIncrement: 'sequence',
  },
  {
    id: 'mssql',
    label: 'SQL Server',
    types: {
      TEXT: 'VARCHAR(MAX)',
      BOOLEAN: 'BIT',
      TIMESTAMP: 'DATETIME2', // MSSQL TIMESTAMP는 rowversion이라 다른 의미
      JSON: 'NVARCHAR(MAX)',
      UUID: 'UNIQUEIDENTIFIER',
      BLOB: 'VARBINARY(MAX)',
      DOUBLE: 'FLOAT',
    },
    autoIncrement: 'attribute',
  },
]

export function dbmsTemplate(id: string): DbmsTemplate {
  return DBMS_TEMPLATES.find((t) => t.id === id) ?? DBMS_TEMPLATES[0]
}

/** 서버 database_types 코드 → 템플릿 id. 문서 대상 DBMS는 문서 생성 시점의 모델 메타로
 *  고정되며(에디터에서 전환하지 않는다), 이 매핑이 렌더 시점의 템플릿을 결정한다.
 *  알 수 없는 코드는 공용(논리) 폴백 — 코드 테이블이 템플릿보다 앞서 늘어나도 깨지지 않게. */
export function templateIdForDatabase(databaseType: string): string {
  const code = databaseType.trim().toLowerCase()
  if (code === 'postgresql') return 'postgres' // 코드 테이블 표준 명명 → 템플릿 id
  return DBMS_TEMPLATES.some((t) => t.id === code) ? code : 'common'
}

/** 공용 논리 코드를 DBMS 물리 표기로 — 매핑이 없으면 공용 코드 폴백 */
export function physicalType(code: string, dbmsId: string): string {
  return dbmsTemplate(dbmsId).types[code] ?? code
}

/** 물리 타입 표기를 공용 논리 코드로 되돌린 파싱 결과 — length는 CHAR·VARCHAR 계열,
 *  precision·scale은 DECIMAL·NUMERIC 계열에만 들어간다(나머지는 null) */
export interface ParsedPhysicalType {
  code: string
  length: number | null
  precision: number | null
  scale: number | null
}

/** 물리 타입 표기(예: 'VARCHAR(100)', 'DECIMAL(15,2)') → 공용 논리 코드 + 파라미터.
 *  용어 사전 types 값(키 = 문서 DB 종류, 물리 표기로 저장)을 컬럼에 적용할 때 쓴다.
 *  이름은 ① 문서 DBMS 물리 표기 역매핑(postgres 'INTEGER'→INT, mssql 'BIT'→BOOLEAN —
 *  사전 값이 그 DBMS 방언으로 적혀 있기 때문) ② 공용 코드 직접 매칭 순서로 찾고,
 *  못 찾으면 null(호환되는 논리 타입이 없으면 타입 칸은 건드리지 않는다).
 *  인자는 타입 스펙에 맞게만 해석한다 — DECIMAL(15,2) → precision 15·scale 2,
 *  'VARCHAR(MAX)'처럼 숫자가 아니면 그 파라미터는 null(스펙상 무기본). */
export function parsePhysicalType(raw: string, dbmsId: string): ParsedPhysicalType | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const match = /^([A-Za-z][A-Za-z0-9_ ]*?)\s*(?:\(([^()]*)\))?$/.exec(trimmed)
  if (!match) return null
  // 비교는 인자를 뺀 기본 이름으로 — 'TINYINT(1)'과 'TINYINT'가 같은 타입으로 만난다
  const base = (text: string) => text.replace(/\(.*$/, '').replace(/\s+/g, ' ').trim().toUpperCase()
  const name = base(match[1])
  const args = (match[2] ?? '').split(',').map((part) => part.trim())

  const matches = DATA_TYPES.filter((t) => base(physicalType(t.code, dbmsId)) === name)
  // 같은 방언 이름에 여러 공용 코드가 걸릴 수 있다(Oracle NUMBER ← TINYINT(3)·DECIMAL·NUMERIC).
  // 인자가 붙은 값은 정밀도형(DECIMAL 계열)을 우선한다 — NUMBER(19)를 TINYINT가 아닌 DECIMAL로.
  // 그 외엔 카탈로그 순서 첫 승자(best-effort — MySQL 'TINYINT(1)'은 TINYINT, BOOLEAN은 'BOOLEAN'로 적힌다)
  const hasArgs = args.some((part) => part !== '')
  const spec =
    (hasArgs ? matches.find((t) => t.precision) : undefined) ??
    matches[0] ??
    DATA_TYPES.find((t) => t.code === name)
  if (!spec) return null

  const int = (value: string | undefined) => {
    const parsed = Number.parseInt(value ?? '', 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  return {
    code: spec.code,
    length: spec.length ? int(args[0]) : null,
    precision: spec.precision ? int(args[0]) : null,
    scale: spec.precision ? int(args[1]) : null,
  }
}
