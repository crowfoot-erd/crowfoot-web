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
  { code: 'DECIMAL', category: 'decimal', precision: true },
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
  label: string
  /** 공용 논리 코드 → 이 DBMS의 물리 표기. 없는 코드는 공용 코드를 그대로 쓴다 */
  types: Record<string, string>
  autoIncrement: AutoIncrementKind
}

export const DBMS_TEMPLATES: DbmsTemplate[] = [
  {
    id: 'common',
    label: '공용(논리)',
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
      DATETIME: 'TIMESTAMP',
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
