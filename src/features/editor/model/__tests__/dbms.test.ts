/**
 * DBMS 템플릿 — 공용 타입 카탈로그·물리 표기 매핑·역매핑(사전 용어 적용)·자동 증가 범주 (05-editor/01-core.md §17)
 */
import { describe, expect, it } from 'vitest'

import {
  DATA_TYPES,
  DBMS_TEMPLATES,
  dataTypeSpec,
  dbmsTemplate,
  isAutoIncrementType,
  parsePhysicalType,
  physicalType,
  templateIdForDatabase,

} from '@/features/editor/model/dbms'

describe('dbms — 공용 타입 카탈로그', () => {
  it('타입 코드는 유일하고 모두 범주를 갖는다', () => {
    const codes = DATA_TYPES.map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const type of DATA_TYPES) {
      expect(type.category).toBeTruthy()
    }
  })

  it('자동 증가는 정수 범주만 가능하다', () => {
    expect(isAutoIncrementType('INT')).toBe(true)
    expect(isAutoIncrementType('BIGINT')).toBe(true)
    expect(isAutoIncrementType('SMALLINT')).toBe(true)
    expect(isAutoIncrementType('TINYINT')).toBe(true)
    expect(isAutoIncrementType('VARCHAR')).toBe(false)
    expect(isAutoIncrementType('DECIMAL')).toBe(false)
    expect(isAutoIncrementType('NUMERIC')).toBe(false)
    expect(isAutoIncrementType('UNKNOWN_TYPE')).toBe(false)
  })

  it('매핑 없는 코드는 공용 코드로 폴백한다', () => {
    expect(dataTypeSpec('VARCHAR')?.length).toBe(true)
    expect(dataTypeSpec('DECIMAL')?.precision).toBe(true)
    expect(dataTypeSpec('NUMERIC')?.precision).toBe(true) // NUMERIC도 DECIMAL과 같은 (p,s)
  })
})

describe('dbms — DBMS 템플릿', () => {
  it('템플릿 id는 유일하다', () => {
    const ids = DBMS_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 매핑 키는 공용 카탈로그에 존재하는 코드다', () => {
    const codes = new Set(DATA_TYPES.map((t) => t.code))
    for (const template of DBMS_TEMPLATES) {
      for (const key of Object.keys(template.types)) {
        expect(codes.has(key)).toBe(true)
      }
    }
  })

  it('공용 논리 코드를 DBMS 물리 표기로 변환한다', () => {
    expect(physicalType('BOOLEAN', 'mysql')).toBe('TINYINT(1)')
    expect(physicalType('BLOB', 'postgres')).toBe('BYTEA')
    expect(physicalType('INT', 'postgres')).toBe('INTEGER')
    expect(physicalType('VARCHAR', 'oracle')).toBe('VARCHAR2')
    expect(physicalType('UUID', 'mssql')).toBe('UNIQUEIDENTIFIER')
    expect(physicalType('TIMESTAMP', 'mssql')).toBe('DATETIME2')
    // 매핑이 없으면 공용 코드 폴백 — common 템플릿은 전부 폴백
    expect(physicalType('VARCHAR', 'common')).toBe('VARCHAR')
  })

  it('PG 시각 타입은 두 공용 코드가 서로 다른 물리 표기로 갈라진다 — 드롭다운 라벨 중복 없음', () => {
    expect(physicalType('DATETIME', 'postgres')).toBe('TIMESTAMP') // 타임존 없는 시각
    expect(physicalType('TIMESTAMP', 'postgres')).toBe('TIMESTAMPTZ') // UTC 순간
  })

  it('PG의 TINYINT→SMALLINT는 SMALLINT와 같은 라벨이 된다 — 드롭다운은 첫 코드(SMALLINT)만 노출한다', () => {
    expect(physicalType('TINYINT', 'postgres')).toBe(physicalType('SMALLINT', 'postgres'))
  })

  it('NUMERIC·TINYINT의 DBMS별 매핑 — Oracle 숫자는 NUMBER로 모은다', () => {
    expect(physicalType('NUMERIC', 'postgres')).toBe('NUMERIC') // identity 폴백
    expect(physicalType('NUMERIC', 'oracle')).toBe('NUMBER')
    expect(physicalType('DECIMAL', 'oracle')).toBe('NUMBER')
    expect(physicalType('TINYINT', 'oracle')).toBe('NUMBER(3)')
    expect(physicalType('TINYINT', 'mysql')).toBe('TINYINT') // identity 폴백
  })

  it('미등록 id는 common 템플릿으로 폴백한다', () => {
    expect(dbmsTemplate('not-registered').id).toBe('common')
  })

  it('서버 database_types 코드를 템플릿 id로 매핑한다 — 문서 대상 DBMS 고정의 파생 규칙', () => {
    expect(templateIdForDatabase('mysql')).toBe('mysql')
    expect(templateIdForDatabase('postgresql')).toBe('postgres') // 코드 표준 명명 → 템플릿 id
    expect(templateIdForDatabase('PostgreSQL')).toBe('postgres') // 대소문자 무시
    expect(templateIdForDatabase('oracle')).toBe('oracle')
    // 등록 안 된 코드·빈 값 — 공용(논리) 폴백 (코드 테이블이 템플릿보다 앞서 늘어나도 안전)
    expect(templateIdForDatabase('mariadb')).toBe('common')
    expect(templateIdForDatabase('')).toBe('common')
  })
})

describe('dbms — 물리 표기 역매핑(parsePhysicalType)', () => {
  it('사전 용어의 타입 값(문서 DBMS 방언)을 공용 코드 + length/precision/scale로 되돌린다', () => {
    expect(parsePhysicalType('VARCHAR(100)', 'mysql')).toEqual({
      code: 'VARCHAR',
      length: 100,
      precision: null,
      scale: null,
    })
    // decimal 계열 — 사용자 요구: DECIMAL(p,s)의 정밀도·스케일까지 반영
    expect(parsePhysicalType('DECIMAL(15,2)', 'mysql')).toEqual({
      code: 'DECIMAL',
      length: null,
      precision: 15,
      scale: 2,
    })
    expect(parsePhysicalType('decimal(15)', 'mysql')).toEqual({
      code: 'DECIMAL',
      length: null,
      precision: 15,
      scale: null,
    })
    expect(parsePhysicalType('BIGINT', 'mysql')).toEqual({
      code: 'BIGINT',
      length: null,
      precision: null,
      scale: null,
    })
  })

  it('DBMS 방언 표기는 그 DBMS 기준으로 역매핑된다 — 공용 코드로 직접 적은 값도 받는다', () => {
    expect(parsePhysicalType('INTEGER', 'postgres')?.code).toBe('INT') // PG 방언 → 공용 코드
    expect(parsePhysicalType('TIMESTAMPTZ', 'postgres')?.code).toBe('TIMESTAMP')
    expect(parsePhysicalType('UNIQUEIDENTIFIER', 'mssql')?.code).toBe('UUID')
    expect(parsePhysicalType('varchar2(80)', 'oracle')).toEqual({
      // Oracle 방언 + 소문자 — 인자를 뺀 기본 이름끼리 대소문자 무시 비교
      code: 'VARCHAR',
      length: 80,
      precision: null,
      scale: null,
    })
    expect(parsePhysicalType('INT', 'mysql')?.code).toBe('INT') // 공용 코드 직접 매칭(2차 폴백)
  })

  it('같은 방언 이름에 여러 공용 코드가 걸리면 카탈로그 순서(첫 승자)로 정한다 — best-effort', () => {
    // Oracle NUMBER는 DECIMAL·NUMERIC 둘 다 — DECIMAL이 카탈로그에서 앞이라 이긴다
    expect(parsePhysicalType('NUMBER(19)', 'oracle')).toEqual({
      code: 'DECIMAL',
      length: null,
      precision: 19,
      scale: null,
    })
    // MySQL TINYINT(1)은 BOOLEAN의 방언이기도 하다 — TINYINT가 앞이라 정수로 본다
    expect(parsePhysicalType('TINYINT(1)', 'mysql')?.code).toBe('TINYINT')
  })

  it('파싱 불가 값은 null — 타입 칸을 건드리지 않는다', () => {
    expect(parsePhysicalType('', 'mysql')).toBeNull()
    expect(parsePhysicalType('FOO(1)', 'mysql')).toBeNull()
    expect(parsePhysicalType('VARCHAR(MAX)', 'mysql')).toEqual({
      code: 'VARCHAR',
      length: null, // 숫자가 아닌 인자 — 길이 없음
      precision: null,
      scale: null,
    })
  })
})
