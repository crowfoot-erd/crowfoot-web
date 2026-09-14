/**
 * .crown 문서 파일 봉투 — 왕복·검증 (05-editor/00-overview.md §4)
 *
 * content 스키마 검증·레거시 정규화는 content-io를 재사용하므로 여기선 봉투 판별만 확인한다.
 */
import { describe, expect, it } from 'vitest'

import { emptyContent } from '@/features/editor/model/content-io'
import { buildCrownFile, parseCrownFile } from '@/features/editor/model/crown-io'
import type { CrownParseError } from '@/features/editor/model/crown-io'

const META = { name: '주문 서비스 ERD', description: '결제 도메인', databaseType: 'postgresql' }

describe('buildCrownFile → parseCrownFile 왕복', () => {
  it('메타와 content를 그대로 복원한다', () => {
    const file = buildCrownFile(META, emptyContent(), '2026-09-14T00:00:00Z')

    const parsed = parseCrownFile(file)

    expect(parsed.format).toBe('crowfoot-crown')
    expect(parsed.version).toBe(1)
    expect(parsed.exportedAt).toBe('2026-09-14T00:00:00Z')
    expect(parsed.model).toEqual(META)
    expect(parsed.content).toEqual(emptyContent())
  })

  it('description null도 복원된다 — 메타의 선택값', () => {
    const file = buildCrownFile({ ...META, description: null }, emptyContent(), '2026-09-14T00:00:00Z')

    expect(parseCrownFile(file).model.description).toBeNull()
  })

  it('봉투의 v0 content는 v1로 정규화된다 — content-io 재사용', () => {
    const v0Envelope = JSON.stringify({
      format: 'crowfoot-crown',
      version: 1,
      exportedAt: '',
      model: META,
      content: { tables: [], relationships: [] },
    })

    const parsed = parseCrownFile(v0Envelope)

    expect(parsed.content.schemaVersion).toBe(1)
    expect(parsed.content.model.tables).toEqual([])
  })
})

describe('parseCrownFile — 봉투 판별', () => {
  function envelopeWith(overrides: Record<string, unknown>): string {
    return JSON.stringify({
      format: 'crowfoot-crown',
      version: 1,
      exportedAt: '',
      model: META,
      content: emptyContent(),
      ...overrides,
    })
  }

  it('JSON 구문 오류 → SYNTAX', () => {
    expect(() => parseCrownFile('{oops')).toThrowError(
      expect.objectContaining({ code: 'SYNTAX' }) satisfies Partial<CrownParseError>,
    )
  })

  it('format 불일치·객체 아님 → NOT_CROWN', () => {
    expect(() => parseCrownFile(envelopeWith({ format: 'something-else' }))).toThrowError(
      expect.objectContaining({ code: 'NOT_CROWN' }),
    )
    expect(() => parseCrownFile('"just a string"')).toThrowError(
      expect.objectContaining({ code: 'NOT_CROWN' }),
    )
    expect(() => parseCrownFile(envelopeWith({ version: '1' }))).toThrowError(
      expect.objectContaining({ code: 'NOT_CROWN' }),
    )
  })

  it('미래 version → NEWER_VERSION', () => {
    expect(() => parseCrownFile(envelopeWith({ version: 2 }))).toThrowError(
      expect.objectContaining({ code: 'NEWER_VERSION' }),
    )
  })

  it('메타 누락 → INVALID_MODEL', () => {
    expect(() => parseCrownFile(envelopeWith({ model: { ...META, name: '  ' } }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_MODEL' }),
    )
    expect(() => parseCrownFile(envelopeWith({ model: { ...META, databaseType: '' } }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_MODEL' }),
    )
    expect(() => parseCrownFile(envelopeWith({ model: { ...META, description: 3 } }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_MODEL' }),
    )
  })

  it('content 스키마 위반 → INVALID_CONTENT', () => {
    expect(() => parseCrownFile(envelopeWith({ content: { schemaVersion: 1, model: { tables: 'nope' } } }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONTENT' }),
    )
  })
})
