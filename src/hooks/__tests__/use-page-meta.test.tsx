/**
 * usePageMeta 훅 테스트 — 라우트별 head 문서 제목·메타 (storyboard 00-common §3.11)
 *
 * jsdom head는 index.html 기본 메타를 갖고 있지 않아 beforeEach에서 동일한 기본값을 시딩한다.
 * 훅의 기본값 캡처는 모듈에 1회 캐시라 시드가 파일 전체에서 같기만 하면 결정적이다.
 * 설정(title·description·robots)·noindex·canonical·언마운트 복원·StrictMode 멱등을 검증한다.
 */
import { render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { SITE_ORIGIN, usePageMeta, type PageMeta } from '@/hooks/usePageMeta'

const DEFAULT_TITLE = 'Crowfoot — 무료 ERD 에디터 · 설계부터 실제 DB 구동까지'
const DEFAULT_DESCRIPTION = '기본 서비스 설명'

function seedMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

beforeEach(() => {
  document.title = DEFAULT_TITLE
  seedMeta('name', 'description', DEFAULT_DESCRIPTION)
  seedMeta('name', 'robots', 'index, follow')
})

afterEach(() => {
  // 언어 케이스가 남긴 i18n 상태 원복 — 파일 뒤의 기대값(ko) 보호
  void i18n.changeLanguage('ko')
})

function Probe(props: PageMeta) {
  usePageMeta(props)
  return <div>probe</div>
}

const meta = (key: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${key}"]`)
const og = (key: string) => document.head.querySelector<HTMLMetaElement>(`meta[property="og:${key}"]`)
const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')

describe('usePageMeta', () => {
  it('title·description을 head에 반영하고 og:*도 함께 갱신한다', () => {
    render(<Probe title="이용약관 — Crowfoot" description="약관 설명" />)

    expect(document.title).toBe('이용약관 — Crowfoot')
    expect(meta('description')).toHaveAttribute('content', '약관 설명')
    expect(og('title')).toHaveAttribute('content', '이용약관 — Crowfoot')
    expect(og('description')).toHaveAttribute('content', '약관 설명')
    expect(meta('robots')).toHaveAttribute('content', 'index, follow')
  })

  it('noindex면 robots를 noindex, nofollow로 둔다', () => {
    render(<Probe title="로그인" noindex />)

    expect(meta('robots')).toHaveAttribute('content', 'noindex, nofollow')
  })

  it('canonicalPath를 SITE_ORIGIN과 붙여 canonical·og:url을 만든다', () => {
    render(<Probe title="v1.11 — 릴리스" canonicalPath="/release-notes/13" ogType="article" />)

    expect(canonical()).toHaveAttribute('href', `${SITE_ORIGIN}/release-notes/13`)
    expect(og('url')).toHaveAttribute('content', `${SITE_ORIGIN}/release-notes/13`)
    expect(og('type')).toHaveAttribute('content', 'article')
  })

  it('언마운트하면 기본값으로 되돌리고, 훅이 만든 요소는 제거한다', () => {
    const { unmount } = render(
      <Probe title="v1.11 — 릴리스" description="요약" canonicalPath="/release-notes/13" />,
    )

    unmount()

    // 시드에 있던 요소는 원래 내용으로, 없던 요소(og:*, canonical)는 제거
    expect(document.title).toBe(DEFAULT_TITLE)
    expect(meta('description')).toHaveAttribute('content', DEFAULT_DESCRIPTION)
    expect(meta('robots')).toHaveAttribute('content', 'index, follow')
    expect(og('title')).not.toBeInTheDocument()
    expect(canonical()).not.toBeInTheDocument()
  })

  it('StrictMode 이중 effect(설정→복원→재설정) 후에도 최종 상태는 설정값이다', async () => {
    render(
      <StrictMode>
        <Probe title="이용약관 — Crowfoot" />
      </StrictMode>,
    )

    await waitFor(() => expect(document.title).toBe('이용약관 — Crowfoot'))
  })

  it('언어별 canonical — ja면 /ja prefix·og:locale ja_JP·html lang=ja', async () => {
    // LocaleRoute가 /ja 영역에서 언어를 강제한 상태를 만든다
    await i18n.changeLanguage('ja')
    render(<Probe title="v1.16 — 글로벌" canonicalPath="/release-notes/17" ogType="article" />)

    expect(canonical()).toHaveAttribute('href', `${SITE_ORIGIN}/ja/release-notes/17`)
    expect(og('url')).toHaveAttribute('content', `${SITE_ORIGIN}/ja/release-notes/17`)
    expect(og('locale')).toHaveAttribute('content', 'ja_JP')
    expect(document.documentElement.lang).toBe('ja')
  })
})
