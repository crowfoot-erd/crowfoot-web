/**
 * 프리렌더 — 공개 페이지의 언어별 정적 HTML 산출 (04-front/storyboard/00-common.md §3.11)
 *
 * 빌드된 dist/index.html을 템플릿으로 랜딩(/)·/terms × ko·en·ja·zh 8개 HTML을 만든다:
 * head 문구(title·description·og:*·canonical·og:locale)·html lang·JSON-LD를 i18n 번들 값으로
 * 치환하고 hreflang 5개(ko·en·ja·zh·x-default)를 주입한다. SPA 엔트리 그대로라 브라우저에서 열면
 * 하이드레이션되고, 크롤러는 치환된 메타를 읽는다(빌드 게이트: 셀렉터 미발견 시 exit 1).
 *
 * 산출 경로 — nginx try_files($uri → $uri/)가 정적 파일을 먼저 서빙한다:
 *   dist/index.html(ko 랜딩, 제자리 치환)·dist/{en,ja,zh}/index.html
 *   dist/terms/index.html·dist/{en,ja,zh}/terms/index.html
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

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const template = readFileSync(`${DIST}/index.html`, 'utf8')
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
