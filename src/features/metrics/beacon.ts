/**
 * 접속 비콘 송신기 (08-core/10-metrics.md §3 — fire-and-forget)
 *
 * 부팅 1회 + 라우트 변경마다 현재 경로를 무인증 POST /api/v1/core/metrics/visit로 보낸다.
 * 응답은 204 본문 없음 — 성공·실패 모두 무시한다(통계가 화면 기능을 절대 방해하지 않는다).
 * 같은 경로 30초 내 재전송은 클라이언트에서도 스킵한다(서버 30초 중복 제거의 이중 방어).
 */
import { API_BASE_URL } from '@/api/client'

const SKIP_WINDOW_MS = 30_000

/** 경로별 마지막 송신 시각 — 모듈 상태(세션 생존 범위) */
const lastSentAt = new Map<string, number>()

export interface VisitBeaconInput {
  path: string
  referrer?: string
}

/**
 * 비콘 1건 송신. true=송신함(또는 폴백 예약), false=30초 창 스킵.
 * sendBeacon을 우선하고 미지원·거절 환경은 fetch(keepalive)로 폴백한다.
 */
export function sendVisitBeacon(input: VisitBeaconInput): boolean {
  const path = input.path || '/'
  const now = Date.now()
  const last = lastSentAt.get(path) ?? 0
  if (now - last < SKIP_WINDOW_MS) return false
  lastSentAt.set(path, now)

  const body = JSON.stringify({ path, referrer: input.referrer || undefined })
  const url = `${API_BASE_URL}/api/v1/core/metrics/visit`
  try {
    // sendBeacon은 헤더를 못 주므로 Blob의 type으로 Content-Type을 싣는다
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    ) {
      return true
    }
  } catch {
    // sendBeacon 예외 — 폴백으로 이어진다
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
    keepalive: true,
  }).catch(() => {
    // 오프라인 등 — 통계 송신 실패는 무시
  })
  return true
}

/** 테스트 전용 — 송신 이력(30초 창) 초기화. 프로덕션 코드는 호출하지 않는다 */
export function resetVisitBeaconStateForTest(): void {
  lastSentAt.clear()
}
