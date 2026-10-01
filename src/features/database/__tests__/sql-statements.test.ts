/**
 * 실행할 문장 고르기 (09-database-manager/00-data-browser.md §5.3)
 */
import { describe, expect, it } from 'vitest'

import { statementRanges, statementToRun } from '@/features/database/sql-statements'

const MYSQL = true
const POSTGRES = false

describe('statementToRun', () => {
  const sql = 'SELECT 1;\nSELECT 2;\n\nUPDATE t SET a = 1'

  it('커서가 놓인 문장을 고른다', () => {
    expect(statementToRun(sql, 3, 3, MYSQL)).toBe('SELECT 1')
    expect(statementToRun(sql, 12, 12, MYSQL)).toBe('SELECT 2')
    expect(statementToRun(sql, sql.length, sql.length, MYSQL)).toBe('UPDATE t SET a = 1')
  })

  it('커서가 세미콜론 바로 뒤에 있으면 앞 문장을 고른다', () => {
    expect(statementToRun('SELECT 1;', 9, 9, MYSQL)).toBe('SELECT 1')
    expect(statementToRun('SELECT 1;\n\n', 11, 11, POSTGRES)).toBe('SELECT 1')
  })

  it('글자를 선택했으면 선택한 부분만 보낸다', () => {
    expect(statementToRun(sql, 10, 18, MYSQL)).toBe('SELECT 2')
    expect(statementToRun('SELECT a, b FROM t', 0, 8, MYSQL)).toBe('SELECT a')
  })

  it('내용이 없으면 빈 문자열', () => {
    expect(statementToRun('', 0, 0, MYSQL)).toBe('')
    expect(statementToRun('   \n', 2, 2, POSTGRES)).toBe('')
  })
})

describe('statementRanges', () => {
  it('따옴표·주석 안의 세미콜론은 경계가 아니다', () => {
    expect(statementRanges("SELECT 'a;b'; SELECT 2", MYSQL)).toHaveLength(2)
    expect(statementRanges('SELECT 1 -- ; 주석\n; SELECT 2', POSTGRES)).toHaveLength(2)
    expect(statementRanges('SELECT 1 /* ; */ ; SELECT `a;b`', MYSQL)).toHaveLength(2)
  })

  it('방언별 이스케이프 — MySQL은 백슬래시, PostgreSQL은 달러 인용', () => {
    expect(statementRanges("SELECT '\\'; x'; SELECT 2", MYSQL)).toHaveLength(2)
    expect(statementRanges('SELECT $$a; b$$; SELECT 2', POSTGRES)).toHaveLength(2)
    expect(statementRanges('SELECT $tag$ a; $$ b; $tag$', POSTGRES)).toHaveLength(1)
  })
})
