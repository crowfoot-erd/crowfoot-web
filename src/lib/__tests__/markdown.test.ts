/**
 * summarizeMarkdown 테스트 — 마크다운 본문 한 줄 요약 (storyboard 00-common §3.11)
 *
 * 릴리스 노트 content(마크다운 원문)에서 meta description용 평문을 뽑는 규칙을 검증한다.
 */
import { describe, expect, it } from 'vitest'

import { summarizeMarkdown } from '@/lib/markdown'

describe('summarizeMarkdown', () => {
  it('헤딩·강조·취소선 마커를 걷어내고 본문만 남긴다', () => {
    const markdown = '## 주요 기능\n\n- **빠른 내보내기** — ~~구 버전~~ 대비 빠르다\n- `PNG` 두 범위 지원'
    expect(summarizeMarkdown(markdown)).toBe('주요 기능 빠른 내보내기 — 구 버전 대비 빠르다 PNG 두 범위 지원')
  })

  it('링크·이미지는 표시 문자만 남기고, 코드 펜스는 통째로 제거한다', () => {
    const markdown = '소개는 [문서](https://example.com) 참고.\n\n```sql\nSELECT 1;\n```\n끝.'
    expect(summarizeMarkdown(markdown)).toBe('소개는 문서 참고. 끝.')
  })

  it('개행·연속 공백을 하나로 정리한다', () => {
    expect(summarizeMarkdown('첫째\n\n둘째\n셋째')).toBe('첫째 둘째 셋째')
  })

  it('max 초과 시 말줄임 …로 자른다', () => {
    const summary = summarizeMarkdown('가'.repeat(200), 160)
    expect(summary).toHaveLength(160)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('max 이내면 그대로 돌려준다', () => {
    expect(summarizeMarkdown('짧은 본문', 160)).toBe('짧은 본문')
  })

  it('빈 입력은 빈 문자열', () => {
    expect(summarizeMarkdown('  \n\t ')).toBe('')
  })
})
