/**
 * 동적 사이트맵 생성 — 활성 공유 문서 <url> 행 (04-front/storyboard/00-common.md §3.11 v1.25)
 *
 * vite build가 public/sitemap.xml을 dist로 복사한 뒤 실행된다. core 공개 엔드포인트
 * GET /api/v1/core/shares/sitemap(활성 공유 문서당 최신 링크 + lastmod, updated_at desc,
 * 08-core/02-model.md §1.10.9)을 읽어 SHARE-SITEMAP 마커 자리를 <url> 행으로 교체해
 * dist/sitemap.xml을 확정한다. public/sitemap.xml 원본은 마커만 남는다 — 릴리스 노트 행은
 * 여전히 원본에 수기 append-only(이 스크립트는 건드리지 않는다).
 *
 * - hreflang 5벌(ko/en/ja/zh/x-default)은 모두 같은 단일 URL을 가리킨다 — 공유 문서는
 *   언어 prefix가 없고 뷰어가 언어를 고른다(prerender-shares.mjs와 같은 규칙).
 * - API 기점은 빌드와 같은 값으로 해석한다: process.env.VITE_API_BASE_URL → .env.production
 *   → 로컬 게이트웨이 폴백. 로컬 core도 운영과 같은 공유 DB를 보므로 데이터는 동일하다.
 * - 조회 실패·응답 이형은 빌드를 실패시킨다(prerender-shares와 같은 엄격 정책 — 사이트맵이
 *   조용히 빈 채로 배포되는 드리프트를 넘기지 않는다). 비상 우회는 SITEMAP_ALLOW_EMPTY=1.
 * - 마커가 없으면(원본 훼손) 빌드 실패 — 정적 기본행만 배포되는 상태를 허용하지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST_SITEMAP = resolve(here, '../dist/sitemap.xml')
const SITE_ORIGIN = 'https://crowfoot.java21.net'
/** 마커 한 줄(개행 포함) — 생성된 행으로 교체된다. strip-deploy-comments 이전에 실행되므로 주석 형태여도 안전.
 *  마커 문구에 <url> 따위의 '>'가 포함돼도 닫는 -->까지 한 줄 안에서 찾는다(헤더 주석의 SHARE-SITEMAP 언급은 <!-- 바로 뒤가 아니라 안 걸린다) */
const MARKER_RE = /^[ \t]*<!--\s*SHARE-SITEMAP[^\n]*?-->\r?\n/m
/** 공유 토큰 규격 — 22자 base62(ShareTokenGenerator). 벗어나면 데이터 드리프트로 본다 */
const TOKEN_RE = /^[A-Za-z0-9]{22}$/

/** 빌드와 같은 API 기점 해석 — vite가 읽는 .env.production을 직접 파싱한다 */
function apiBase() {
  if (process.env.VITE_API_BASE_URL) return process.env.VITE_API_BASE_URL
  try {
    const env = readFileSync(resolve(here, '../.env.production'), 'utf8')
    const hit = /^VITE_API_BASE_URL=(.*)$/m.exec(env)
    if (hit) return hit[1].trim().replaceAll('"', '').replaceAll("'", '')
  } catch {
    // .env.production 없음(부분 체크아웃 등) — 로컬 스택 게이트웨이로 간다
  }
  return 'http://localhost:8000'
}

/** 활성 공유 원료 조회 — HTTP 오류·포맷 이형·토큰 규격 위반은 예외로 번진다(빌드 실패) */
async function fetchShares(base) {
  let res
  try {
    res = await fetch(`${base}/api/v1/core/shares/sitemap`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (cause) {
    throw new Error(`generate-sitemap: 조회 실패 — ${base}/api/v1/core/shares/sitemap (${cause.message})`)
  }
  if (!res.ok) {
    throw new Error(`generate-sitemap: HTTP ${res.status} — ${base}/api/v1/core/shares/sitemap`)
  }
  const payload = await res.json()
  if (payload?.header?.isSuccessful !== true || !Array.isArray(payload.responses)) {
    throw new Error('generate-sitemap: 응답 포맷 이형 — header.isSuccessful·responses 확인')
  }
  const seen = new Set()
  return payload.responses.map((row) => {
    if (!TOKEN_RE.test(row?.shareToken ?? '')) {
      throw new Error(`generate-sitemap: 토큰 규격 위반 — ${JSON.stringify(row)}`)
    }
    if (seen.has(row.shareToken)) {
      throw new Error(`generate-sitemap: 토큰 중복 — ${row.shareToken}`)
    }
    seen.add(row.shareToken)
    return row
  })
}

/** 공유 문서 <url> 행 — lastmod는 W3C date(UTC)로 자른다(정적 행과 같은 표기) */
function shareRow(row) {
  const url = `${SITE_ORIGIN}/share/${row.shareToken}`
  const links = ['ko', 'en', 'ja', 'zh', 'x-default']
    .map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${url}" />`)
    .join('\n')
  const lastmod = typeof row.lastmod === 'string' && row.lastmod !== '' ? `    <lastmod>${row.lastmod.slice(0, 10)}</lastmod>\n` : ''
  return `  <url>\n    <loc>${url}</loc>\n${links}\n${lastmod}    <priority>0.8</priority>\n  </url>`
}

const sitemap = readFileSync(DIST_SITEMAP, 'utf8')
if (!MARKER_RE.test(sitemap)) {
  throw new Error('generate-sitemap: SHARE-SITEMAP 마커 없음 — public/sitemap.xml 확인')
}

let rows = ''
if (process.env.SITEMAP_ALLOW_EMPTY === '1') {
  console.warn('generate-sitemap: SITEMAP_ALLOW_EMPTY=1 — 공유 행 없이 기본행만 배포한다(비상 우회)')
} else {
  const base = apiBase()
  const shares = await fetchShares(base)
  rows = shares.map(shareRow).join('\n')
  console.log(`generate-sitemap: 활성 공유 ${shares.length}건 등록 (원료 ${base})`)
}

// 마커 줄을 생성 행으로 교체 — 마커가 사라므로 strip-deploy-comments가 남은 주석(헤더)만 걷는다
writeFileSync(DIST_SITEMAP, sitemap.replace(MARKER_RE, rows === '' ? '' : `${rows}\n`))
