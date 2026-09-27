/**
 * DBMS 상징 아이콘 테스트 — 브랜드 path 매핑·서버 코드/템플릿 id 항등·공용 폴백
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DbmsIcon } from '@/components/dbms-icon'

const brandPathOf = (databaseType: string) =>
  render(<DbmsIcon databaseType={databaseType} />).container.querySelector('svg path')?.getAttribute('d') ?? ''

describe('DbmsIcon — DBMS 상징 아이콘', () => {
  it('지원 DBMS는 브랜드 path svg를 브랜드색으로 그린다', () => {
    const { container } = render(<DbmsIcon databaseType="postgresql" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // simple-icons path는 단일 긴 path다 — 라벨 옆에서 DB를 상징하는 실물
    expect(brandPathOf('postgresql').length).toBeGreaterThan(80)
    expect(svg?.style.color).toBe('rgb(65, 110, 90)') // #416E5A
  })

  it('서버 코드(postgresql)와 템플릿 id(postgres)가 같은 아이콘이다 — templateIdForDatabase 항등', () => {
    expect(brandPathOf('postgresql')).toBe(brandPathOf('postgres'))
    expect(brandPathOf('mysql')).toBe(brandPathOf('mysql'))
  })

  it('공용(common)·알 수 없는 코드는 lucide Database 실루엣 폴백 — 브랜드 path가 아니다', () => {
    for (const code of ['common', 'some-future-db']) {
      const { container } = render(<DbmsIcon databaseType={code} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      // 브랜드색 인라인 style이 없다 = 폴백
      expect(svg?.style.color).toBe('')
      expect(svg?.querySelector('path')?.getAttribute('d')?.length ?? 0).toBeLessThan(80)
    }
  })
})
