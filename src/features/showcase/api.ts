/**
 * 사이트 쇼케이스 API (08-core/19-site-showcase.md Section 1.3·3)
 *
 * - 문서의 사이트: 조회(멤버)·등록·수정·다시 가져오기·삭제(Editor 이상)
 * - 공개 목록·신고: 목록은 무인증(게이트웨이 화이트리스트), 신고는 로그인
 * - 관리자 목록·숨김
 * 페이지는 0부터다(Section 3.5) — 앱의 다른 오프셋 목록(1부터)과 다르다
 */
import { API_BASE_URL, apiDelete, apiGet, apiGetPage, apiPatch, apiPost, apiPut } from '@/api/client'

/** 문서의 사이트 — 등록한 사람에게 보이는 전체 정보(Section 3.1) */
export interface ModelSite {
  siteId: string
  url: string
  title: string
  description: string | null
  siteName: string | null
  faviconUrl: string | null
  /** 썸네일 경로(API 기점 없음). 썸네일이 없으면 null */
  thumbnailUrl: string | null
  capturedAt: string | null
  /** 마지막 캡처 실패 사유 — 성공하면 null */
  captureError: string | null
  hidden: boolean
  reportCount: number
  createdAt: string
  updatedAt: string
}

/** 등록·수정 본문(Section 3.2) — 같은 주소일 때 title 생략은 유지, description ""은 지우기 */
export interface ModelSiteBody {
  url: string
  title?: string
  description?: string
}

/** 공개 목록 카드(Section 3.5) — 공유 중일 때만 shareToken이 있다 */
export interface ShowcaseSite {
  siteId: string
  url: string
  title: string
  description: string | null
  siteName: string | null
  faviconUrl: string | null
  thumbnailUrl: string | null
  modelName: string
  databaseType: string
  shareToken?: string
  createdAt: string
}

/** 관리자 목록 항목(Section 3.8) — 공개 필드에 관리 정보를 더한다 */
export interface AdminShowcaseSite extends ShowcaseSite {
  hidden: boolean
  hiddenAt: string | null
  /** 신고 누적으로 숨긴 경우(hidden_by 없음) */
  autoHidden: boolean
  reportCount: number
  captureError: string | null
  workspaceId: string
  modelId: string
  createdBy: string | null
}

export type AdminShowcaseFilter = 'all' | 'visible' | 'hidden'

/** 썸네일 경로 → <img src> 주소 (API 기점을 붙인다) */
export function showcaseImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`
}

/** 주소의 호스트 — 대체 그림과 카드 부제에 쓴다 */
export function siteHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function siteBase(workspaceId: string, modelId: string) {
  return `/api/v1/core/workspaces/${workspaceId}/models/${modelId}/site`
}

/* ---------- 문서의 사이트 (Section 3.1~3.4) ---------- */

/** 등록한 사이트가 없으면 null(200) */
export async function fetchModelSite(workspaceId: string, modelId: string, signal?: AbortSignal) {
  const site = await apiGet<ModelSite | null>(siteBase(workspaceId, modelId), undefined, signal)
  return site ?? null
}

/** 처음 등록·주소 변경이면 서버가 캡처를 기다린다(최대 30초) */
export function saveModelSite(workspaceId: string, modelId: string, body: ModelSiteBody) {
  return apiPut<ModelSite>(siteBase(workspaceId, modelId), body)
}

/** 다시 가져오기 — 1분 안에 다시 부르면 429 SITE_CAPTURE_TOO_SOON(등록 때의 캡처도 센다) */
export function recaptureModelSite(workspaceId: string, modelId: string) {
  return apiPost<ModelSite>(`${siteBase(workspaceId, modelId)}/capture`)
}

export function deleteModelSite(workspaceId: string, modelId: string) {
  return apiDelete<void>(siteBase(workspaceId, modelId))
}

/* ---------- 공개 목록·신고 (Section 3.5·3.7) ---------- */

export function fetchShowcaseSites(params: { page?: number; size?: number }, signal?: AbortSignal) {
  return apiGetPage<ShowcaseSite>(
    '/api/v1/core/showcase/sites',
    { page: params.page ?? 0, size: params.size ?? 12 },
    signal,
  )
}

export function reportShowcaseSite(siteId: string, reason?: string) {
  return apiPost<{ reported: boolean }>(
    `/api/v1/core/showcase/sites/${siteId}/reports`,
    reason ? { reason } : {},
  )
}

/* ---------- 관리자 (Section 3.8·3.9) ---------- */

export function fetchAdminShowcaseSites(
  params: { filter: AdminShowcaseFilter; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return apiGetPage<AdminShowcaseSite>(
    '/api/v1/core/admin/showcase/sites',
    {
      hidden: params.filter === 'all' ? undefined : params.filter === 'hidden',
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
    signal,
  )
}

export function updateAdminShowcaseSite(siteId: string, hidden: boolean) {
  return apiPatch<void>(`/api/v1/core/admin/showcase/sites/${siteId}`, { hidden })
}
