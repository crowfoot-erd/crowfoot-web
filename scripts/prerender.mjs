/**
 * 프리렌더 — 공개 페이지의 언어별 정적 HTML 산출 (04-front/storyboard/00-common.md §3.11)
 *
 * 빌드된 dist/index.html을 템플릿으로 랜딩(/)·/terms × ko·en·ja·zh 8개 HTML을 만든다:
 * head 문구(title·description·og:*·canonical·og:locale)·html lang·JSON-LD를 i18n 번들 값으로
 * 치환하고 hreflang 5개(ko·en·ja·zh·x-default)를 주입한다. SPA 엔트리 그대로라 브라우저에서 열면
 * 하이드레이션되고, 크롤러는 치환된 메타를 읽는다(빌드 게이트: 셀렉터 미발견 시 exit 1).
 *
 * 산출 경로 — nginx try_files($uri → $uri/index.html)가 정적 파일을 먼저 서빙한다:
 *   dist/index.html(ko 랜딩, 제자리 치환)·dist/{en,ja,zh}/index.html
 *   dist/terms/index.html·dist/{en,ja,zh}/terms/index.html
 *
 * 앱 껍데기(dist/app.html) — 정적 HTML이 없는 주소(/share/{token}·/release-notes/{id}·보호 경로·
 * 없는 주소)에 nginx가 마지막으로 내려 주는 파일이다(nginx/default.conf). 랜딩 전용 값(canonical·
 * og:url·hreflang·JSON-LD·랜딩 제목)을 뺀 사본이라, 크롤러가 JS 실행 전에 "이 주소의 대표는 홈"이라는
 * 신호를 받지 않는다. 주소별 제목·canonical은 런타임에 usePageMeta가 넣는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, '../dist')
const I18N = resolve(here, '../src/lib/i18n')

const SITE_ORIGIN = 'https://crowfoot.java21.net'
const LANGS = ['ko', 'en', 'ja', 'zh']
const PREFIX = { ko: '', en: '/en', ja: '/ja', zh: '/zh' }
const HTML_LANG = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hans' }
const OG_LOCALE = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', zh: 'zh_CN' }

const bundles = Object.fromEntries(LANGS.map((lang) => [lang, JSON.parse(readFileSync(`${I18N}/${lang}.json`, 'utf8'))]))

/** 랜딩 SEO 문구는 landing.seo, 약관 제목은 런타임 조합(terms.title — appName)과 동일하게 맞춘다 —
 *  프리렌더→하이드레이션 문구 일관. terms 설명은 약관 문구가 검색 설명으로 부적절해 랜딩 문구 유지(런타임 관례) */
const PAGES = [
  {
    path: '',
    out: (prefix) => `${DIST}${prefix}/index.html`,
    title: (b) => b.landing.seo.title,
    description: (b) => b.landing.seo.description,
  },
  {
    path: '/terms',
    out: (prefix) => `${DIST}${prefix}/terms/index.html`,
    title: (b) => `${b.terms.title} — ${b.common.appName}`,
    description: (b) => b.landing.seo.description,
  },
]

/** 정규식 미매칭이면 실패 — 빌드 게이트(스펙 드리프트를 조용히 넘기지 않는다) */
function must(html, re, replacement, label) {
  if (!re.test(html)) throw new Error(`prerender: 셀렉터 미발견 — ${label} (${re})`)
  return html.replace(re, replacement)
}

function localizedUrl(lang, path) {
  return `${SITE_ORIGIN}${PREFIX[lang]}${path || '/'}`
}

function render(template, lang, page) {
  const bundle = bundles[lang]
  const title = page.title(bundle)
  const description = page.description(bundle)
  const canonical = localizedUrl(lang, page.path)

  let html = template
  html = must(html, /<html\s+lang="[^"]*"/, `<html lang="${HTML_LANG[lang]}"`, 'html lang')
  html = must(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`, 'title')
  html = must(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    'meta description',
  )
  html = must(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    'og:title',
  )
  html = must(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    'og:description',
  )
  html = must(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonical}" />`,
    'og:url',
  )
  html = must(
    html,
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    'og:locale',
  )
  // canonical 치환 + hreflang 5개 주입(그 자리에 바로 붙인다) — x-default는 ko.
  // 정규식이 태그 닫힘(/>?)까지 삼켜야 원본 꼬리가 alternates 뒤에 남지 않는다
  const alternates = LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${localizedUrl(l, page.path)}" />`)
  alternates.push(`    <link rel="alternate" hreflang="x-default" href="${localizedUrl('ko', page.path)}" />`)
  html = must(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />\n${alternates.join('\n')}`,
    'canonical+hreflang',
  )
  // JSON-LD — description·url만 언어별로, 나머지 스키마는 유지
  html = must(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    (m) => {
      const json = JSON.parse(m.replace(/<\/?script[^>]*>/g, ''))
      json.description = description
      json.url = canonical
      return `<script type="application/ld+json">\n      ${JSON.stringify(json, null, 2).replace(/\n/g, '\n      ')}\n    </script>`
    },
    'JSON-LD',
  )
  return html
}

/** 앱 껍데기 — 랜딩 전용 값을 뺀다. 설명·og:title·og:image는 링크 미리보기 폴백으로 남긴다
 *  (JS를 실행하지 않는 미리보기 크롤러가 빈 카드를 받지 않게) */
function renderShell(template) {
  let html = template
  html = must(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(bundles.ko.common.appName)}</title>`, 'shell title')
  html = must(html, /[ \t]*<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>\r?\n/, '', 'shell canonical')
  html = must(html, /[ \t]*<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>\r?\n/, '', 'shell og:url')
  html = must(html, /[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\r?\n/, '', 'shell JSON-LD')
  if (/rel="canonical"|hreflang=|application\/ld\+json|property="og:url"/.test(html)) {
    throw new Error('prerender: 앱 껍데기에 랜딩 전용 값이 남았다')
  }
  return html
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const template = readFileSync(`${DIST}/index.html`, 'utf8')
// 앱 껍데기는 치환 전 템플릿에서 만든다 — 아래 루프가 dist/index.html을 ko 랜딩으로 덮어쓰기 전에
writeFileSync(`${DIST}/app.html`, renderShell(template))
console.log('prerender: /app.html (앱 껍데기)')
let produced = 0
for (const page of PAGES) {
  for (const lang of LANGS) {
    const out = page.out(PREFIX[lang])
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, render(template, lang, page))
    produced += 1
    console.log(`prerender: ${out.replace(DIST, '')}`)
  }
}
if (produced !== PAGES.length * LANGS.length) {
  throw new Error(`prerender: 산출 부족 — ${produced}`)
}
