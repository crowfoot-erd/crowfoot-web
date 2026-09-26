/**
 * 쇼케이스 공유 프리렌더 — SEO 산출 (04-front/storyboard/00-common.md §3.11 v1.18)
 *
 * scripts/share-showcase.json 매니페스트(원천 — 커밋됨)의 각 토큰에 대해 빌드된
 * dist/index.html을 템플릿으로 dist/share/{token}/index.html을 만든다:
 * title·description(문서명·설명)·canonical·og:title/description/url/type/image·twitter:image.
 * og:image는 public/og/shares/{token}.png(capture-share-og.mjs 산출, 커밋됨) — 파일이
 * 없으면 빌드를 실패시킨다(카드가 기본 이미지로 폴백하는 스펙 드리프트를 조용히 넘기지 않는다).
 *
 * 매 빌드마다 해시된 에셋 참조가 바뀌므로 산출은 dist에만 두고, 커밋하는 것은 매니페스트와
 * og PNG뿐이다. nginx try_files($uri → $uri/)가 정적 파일을 먼저 서빙해 미리보기 크롤러가
 * 즉시 카드를 읽는다(하이드레이션되는 브라우저 사용자는 같은 화면을 동적으로 얻는다).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, '../dist')
const PUBLIC = resolve(here, '../public')
const SITE_ORIGIN = 'https://crowfoot.java21.net'

/** 정규식 미매칭이면 실패 — 빌드 게이트(prerender.mjs와 같은 규칙) */
function must(html, re, replacement, label) {
  if (!re.test(html)) throw new Error(`prerender-shares: 셀렉터 미발견 — ${label} (${re})`)
  return html.replace(re, replacement)
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const manifest = JSON.parse(readFileSync(`${here}/share-showcase.json`, 'utf8'))
if (!Array.isArray(manifest)) {
  throw new Error('prerender-shares: 매니페스트가 배열이 아니다')
}

const template = readFileSync(`${DIST}/index.html`, 'utf8')
for (const entry of manifest) {
  const { token, title, description } = entry
  if (!token || !title) throw new Error(`prerender-shares: 매니페스트 항목에 token·title이 필요하다 — ${JSON.stringify(entry)}`)
  const ogPath = resolve(PUBLIC, `og/shares/${token}.png`)
  if (!existsSync(ogPath)) {
    throw new Error(`prerender-shares: og 이미지 없음 — public/og/shares/${token}.png (capture-share-og.mjs 먼저)`)
  }
  const canonical = `${SITE_ORIGIN}/share/${token}`
  const ogImage = `${SITE_ORIGIN}/og/shares/${token}.png`
  const desc = description ?? ''

  let html = template
  html = must(html, /<html\s+lang="[^"]*"/, '<html lang="ko"', 'html lang')
  html = must(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)} — Crowfoot</title>`, 'title')
  html = must(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    'meta description',
  )
  html = must(html, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(title)} — Crowfoot" />`, 'og:title')
  html = must(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    'og:description',
  )
  html = must(html, /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/, '<meta property="og:type" content="article" />', 'og:type')
  html = must(html, /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`, 'og:url')
  html = must(html, /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/, '<meta property="og:locale" content="ko_KR" />', 'og:locale')
  html = must(html, /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${ogImage}" />`, 'og:image')
  html = must(html, /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${ogImage}" />`, 'twitter:image')
  // canonical 치환 + hreflang 5개 주입 — 공유 문서는 언어 prefix 없는 단일 URL(뷰어가 언어를 고른다)
  const localized = (l) => canonical
  const alternates = ['ko', 'en', 'ja', 'zh']
    .map((l) => `    <link rel="alternate" hreflang="${l}" href="${localized(l)}" />`)
    .concat(`    <link rel="alternate" hreflang="x-default" href="${canonical}" />`)
  html = must(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />\n${alternates.join('\n')}`,
    'canonical+hreflang',
  )

  const out = `${DIST}/share/${token}/index.html`
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
  console.log(`prerender-shares: /share/${token}/index.html`)
}
if (manifest.length === 0) {
  console.log('prerender-shares: 매니페스트 비어 있음 — 산출 없음')
}
