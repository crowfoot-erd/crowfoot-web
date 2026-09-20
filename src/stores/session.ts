/**
 * 세션 스토어 (storyboard 00-common §3.2·§3.4)
 *
 * - Access 토큰은 api/client 모듈 변수(메모리) — 스토어에 담지 않는다(직렬화 방지)
 * - me는 TanStack Query ['me'] 캐시 단일 소스(staleTime Infinity — §3.2 "1회 조회") —
 *   스토어는 인증 상태 전이만 담는다
 * - 상태: bootstrapping(시작·refresh 확인 중) → authenticated | unauthenticated | error
 * - 부트스트랩 규칙: Access 있음 → 완료 / 없음 → refresh(200 자동 로그인, 401 비인증,
 *   5xx·네트워크 → error + 재시도 버튼, **로그아웃 처리 금지**)
 * - sessionExpired: 치명 401로 인한 세션 만료 오버레이(§4.1) 표시 여부 — 다른 탭에서도
 *   BroadcastChannel 수신 시 설정된다. 이 신호만으로는 라우트 가드가 동작하지 않는다
 *   (오버레이 [다시 로그인] 클릭 시 비로소 로그인으로 이동).
 */
import { create } from 'zustand'

import { clearAccessToken, getAccessToken, refreshAccessToken } from '@/api/client'

export type SessionStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'error'

interface SessionState {
  status: SessionStatus
  /** 세션 만료 오버레이 사유 resultCode — null이면 미표시 */
  sessionExpiredReason: string | null
  /**
   * 로그아웃 진행 중 — 세션 폐기 리렌더와 문서 이동(assign) 사이에 보호 라우트 가드가
   * /login으로 보내는 섬광(flash)을 억제한다. 문서가 교체되면 초기값으로 돌아간다.
   */
  loggingOut: boolean

  /** Access 교환·부트스트랩 성공 */
  signIn: () => void
  /** 부트스트랩(재)시작 */
  bootstrap: () => Promise<void>
  /** 세션 만료 이벤트 수신 (치명 401) */
  expireSession: (resultCode: string) => void
  /** 로그아웃·오버레이 [다시 로그인] — 로컬 상태 폐기 */
  clearSession: () => void
  /** 로그아웃 시작 선언 — 가드 억제 플래그 (useLogout) */
  beginLogout: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'bootstrapping',
  sessionExpiredReason: null,
  loggingOut: false,

  signIn: () => set({ status: 'authenticated', loggingOut: false }),

  bootstrap: async () => {
    set({ status: 'bootstrapping', loggingOut: false })

    // Access가 메모리에 있으면 refresh 불필요 — 그대로 인증 상태
    if (getAccessToken()) {
      set({ status: 'authenticated' })
      return
    }

    const outcome = await refreshAccessToken()
    if (outcome === 'success') {
      set({ status: 'authenticated' })
    } else if (outcome === 'unauthenticated') {
      // 콜백(S-02) 교환이 이 refresh보다 먼저 Access를 심었다면
      // 세션을 폐기하지 않는다 — 경쟁 시 인증 완료를 우선한다
      if (getAccessToken()) {
        set({ status: 'authenticated' })
      } else {
        clearAccessToken()
        set({ status: 'unauthenticated' })
      }
    } else {
      // 5xx·네트워크 실패 — 로그아웃 처리 금지, 재시도 유도 (§3.2)
      set({ status: 'error' })
    }
  },

  expireSession: (resultCode) => set({ sessionExpiredReason: resultCode }),

  clearSession: () => set({ status: 'unauthenticated', sessionExpiredReason: null }),

  beginLogout: () => set({ loggingOut: true }),
}))

/** 테스트·초기화용 — 토큰까지 완전 폐기 */
export function resetSession(): void {
  clearAccessToken()
  useSessionStore.getState().clearSession()
}
