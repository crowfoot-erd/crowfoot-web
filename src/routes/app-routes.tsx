/**
 * 라우팅 (storyboard 00-common §2.3 — 직접 URL 접근 규칙 + §3.3 언어 prefix)
 *
 * 경로 서브트리를 buildRoutes(prefix)로 만들어 ko(무prefix)·/en·/ja·/zh 4벌로 복제한다.
 * 기존 ko 경로 문자열은 불변 — 기존 페이지 테스트 전수가 이 라우팅의 회귀 게이트다.
 * 각 그룹은 LocaleRoute(pathless)로 감싸 URL prefix가 언어를 결정하게 한다.
 *
 * /·/login·/auth/callback·/terms 공개(게스트 랜딩·로그인·콜백·이용약관) /share/{token} 공개(공유 문서
 * 읽기 전용 뷰어 — 토큰이 자격) /release-notes/{postId} 공개(릴리스 노트 읽기 전용 뷰어) /
 * 나머지 ProtectedRoute → AppLayout 셸 / /admin/* AdminRoute /
 * catch-all 404. 탭 상태(WS 멤버·설정)는 쿼리 파라미터로 유지된다.
 */
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { LANGUAGE_PREFIXES } from '@/lib/i18n'
import { AdminRoute } from '@/routes/admin-route'
import { ProtectedRoute } from '@/routes/protected-route'
import { LocaleRoute } from '@/routes/locale-route'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthCallbackPage } from '@/pages/auth-callback'
import { DashboardPage } from '@/pages/dashboard'
import { LandingPage } from '@/pages/landing'
import { LoginPage } from '@/pages/login'
import { ShareViewerPage } from '@/pages/share-viewer'
import { ReleaseNoteViewerPage } from '@/pages/release-note-viewer'
import { TermsPage } from '@/pages/terms'
import { ModelViewerPage } from '@/pages/model-viewer'
import { ModelVersionViewerPage } from '@/pages/model-version-viewer'
import { NotFoundPage } from '@/pages/not-found'
import { TeamDetailPage } from '@/pages/team-detail'
import { TeamsPage } from '@/pages/teams'
import { WorkspaceDetailPage } from '@/pages/workspace-detail'
import { WorkspacesPage } from '@/pages/workspaces'
import { AdminAuditLogsPage } from '@/pages/admin/audit-logs'
import { AdminCodesPage } from '@/pages/admin/codes'
import { AdminManagedPage } from '@/pages/admin/managed'
import { AdminSystemTermsPage } from '@/pages/admin/system-terms'
import { AdminUserDetailPage } from '@/pages/admin/user-detail'
import { AdminUsersPage } from '@/pages/admin/users'
import { SplashScreen } from '@/components/splash-screen'

// 트래픽 통계는 recharts를 물려와 번들이 크다 — 관리자 통계 화면 전용 청크로 분리한다(03-admin §9)
const AdminTrafficPage = lazy(() => import('@/pages/admin/traffic'))
import { CommunityBoardPage } from '@/pages/community/board'
import { CommunityPostDetailPage } from '@/pages/community/post-detail'
import { CommunityPostFormPage } from '@/pages/community/post-form'

/** 한 언어 영역의 경로 서브트리 — prefix(''|'/en'|'/ja'|'/zh')를 앞에 붙인다 */
function buildRoutes(prefix: string) {
  return (
    <>
      {/* 공개 — 셸 없음 */}
      <Route path={prefix === '' ? '/' : prefix} element={<LandingPage />} />
      <Route path={`${prefix}/login`} element={<LoginPage />} />
      <Route path={`${prefix}/auth/callback`} element={<AuthCallbackPage />} />
      <Route path={`${prefix}/terms`} element={<TermsPage />} />
      {/* 공유 문서 공개 뷰어 — 토큰을 아는 누구나 (기간 내) */}
      <Route path={`${prefix}/share/:token`} element={<ShareViewerPage />} />
      {/* 릴리스 노트 공개 뷰어 — 누구나(랜딩 최근 릴리스·docs README 링크의 행선지) */}
      <Route path={`${prefix}/release-notes/:postId`} element={<ReleaseNoteViewerPage />} />

      {/* 보호 — 앱 셸 4분할 */}
      <Route element={<ProtectedRoute />}>
        {/* 문서 열기 — 새 창 전체 화면(셸 없음), ERD 탭의 이름·돋보기로 진입 */}
        <Route
          path={`${prefix}/workspaces/:workspaceId/models/:modelId`}
          element={<ModelViewerPage />}
        />
        {/* 버전 기록 뷰어 — 해당 시점 스냅샷 읽기 전용(셸 없음), 버전 기록 다이얼로그의 조회 링크 */}
        <Route
          path={`${prefix}/workspaces/:workspaceId/models/:modelId/history/:version`}
          element={<ModelVersionViewerPage />}
        />

        <Route element={<AppLayout />}>
          {/* 앱 홈 — 게스트 / 는 랜딩(소개) 페이지가 담당한다 */}
          <Route path={`${prefix}/dashboard`} element={<DashboardPage />} />
          <Route path={`${prefix}/workspaces`} element={<WorkspacesPage />} />
          <Route path={`${prefix}/workspaces/:workspaceId`} element={<WorkspaceDetailPage />} />
          <Route path={`${prefix}/teams`} element={<TeamsPage />} />
          <Route path={`${prefix}/teams/:teamId`} element={<TeamDetailPage />} />

          {/* 커뮤니티 — 로그인 사용자 누구나(릴리스 노트 쓰기는 관리자, 서버 판정).
              posts/new 정적 세그먼트가 :postId보다 우선한다(react-router 라우팅 순서 규칙).
              index Navigate는 상대 경로 — 언어 prefix 안에서도 같은 영역으로 되돌아간다 */}
          <Route path={`${prefix}/community`}>
            <Route index element={<Navigate to="release-notes" replace />} />
            <Route path="release-notes" element={<CommunityBoardPage board="RELEASE_NOTE" />} />
            <Route path="feedback" element={<CommunityBoardPage board="FEEDBACK" />} />
            <Route path="posts/new" element={<CommunityPostFormPage mode="create" />} />
            <Route path="posts/:postId" element={<CommunityPostDetailPage />} />
            <Route path="posts/:postId/edit" element={<CommunityPostFormPage mode="edit" />} />
          </Route>

          {/* 관리자 — 비관리자는 404 렌더 */}
          <Route path={`${prefix}/admin`} element={<AdminRoute />}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
            <Route path="codes" element={<AdminCodesPage />} />
            <Route path="managed" element={<AdminManagedPage />} />
            <Route path="system-terms" element={<AdminSystemTermsPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          <Route
            path="traffic"
            element={
              <Suspense fallback={<SplashScreen />}>
                <AdminTrafficPage />
              </Suspense>
            }
          />
          </Route>
        </Route>
      </Route>

      {/* 정의되지 않은 경로 — 언어 영역별 404(선언 순서상 ko가 먼저 매칭을 잡는다) */}
      <Route path={`${prefix}/*`} element={<NotFoundPage />} />
    </>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      {[LANGUAGE_PREFIXES.ko, LANGUAGE_PREFIXES.en, LANGUAGE_PREFIXES.ja, LANGUAGE_PREFIXES.zh].map(
        (prefix) => (
          <Route key={prefix || 'ko'} element={<LocaleRoute />}>
            {buildRoutes(prefix)}
          </Route>
        ),
      )}
    </Routes>
  )
}
