/**
 * 라우팅 (storyboard 00-common §2.3 — 직접 URL 접근 규칙)
 *
 * /·/login·/auth/callback·/terms 공개(게스트 랜딩·로그인·콜백·이용약관) /share/{token} 공개(공유 문서
 * 읽기 전용 뷰어 — 토큰이 자격) /release-notes/{postId} 공개(릴리스 노트 읽기 전용 뷰어) /
 * 나머지 ProtectedRoute → AppLayout 셸 / /admin/* AdminRoute /
 * catch-all 404. 탭 상태(WS 멤버·설정)는 쿼리 파라미터로 유지된다.
 */
import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminRoute } from '@/routes/admin-route'
import { ProtectedRoute } from '@/routes/protected-route'
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
import { AdminUserDetailPage } from '@/pages/admin/user-detail'
import { AdminUsersPage } from '@/pages/admin/users'
import { CommunityBoardPage } from '@/pages/community/board'
import { CommunityPostDetailPage } from '@/pages/community/post-detail'
import { CommunityPostFormPage } from '@/pages/community/post-form'

export function AppRoutes() {
  return (
    <Routes>
      {/* 공개 — 셸 없음 */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/terms" element={<TermsPage />} />
      {/* 공유 문서 공개 뷰어 — 토큰을 아는 누구나 (기간 내) */}
      <Route path="/share/:token" element={<ShareViewerPage />} />
      {/* 릴리스 노트 공개 뷰어 — 누구나(랜딩 최근 릴리스·docs README 링크의 행선지) */}
      <Route path="/release-notes/:postId" element={<ReleaseNoteViewerPage />} />

      {/* 보호 — 앱 셸 4분할 */}
      <Route element={<ProtectedRoute />}>
        {/* 문서 열기 — 새 창 전체 화면(셸 없음), ERD 탭의 이름·돋보기로 진입 */}
        <Route path="/workspaces/:workspaceId/models/:modelId" element={<ModelViewerPage />} />
        {/* 버전 기록 뷰어 — 해당 시점 스냅샷 읽기 전용(셸 없음), 버전 기록 다이얼로그의 조회 링크 */}
        <Route
          path="/workspaces/:workspaceId/models/:modelId/history/:version"
          element={<ModelVersionViewerPage />}
        />

        <Route element={<AppLayout />}>
          {/* 앱 홈 — 게스트 / 는 랜딩(소개) 페이지가 담당한다 */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />

          {/* 커뮤니티 — 로그인 사용자 누구나(릴리스 노트 쓰기는 관리자, 서버 판정).
              posts/new 정적 세그먼트가 :postId보다 우선한다(react-router 라우팅 순서 규칙) */}
          <Route path="/community">
            <Route index element={<Navigate to="/community/release-notes" replace />} />
            <Route path="release-notes" element={<CommunityBoardPage board="RELEASE_NOTE" />} />
            <Route path="feedback" element={<CommunityBoardPage board="FEEDBACK" />} />
            <Route path="posts/new" element={<CommunityPostFormPage mode="create" />} />
            <Route path="posts/:postId" element={<CommunityPostDetailPage />} />
            <Route path="posts/:postId/edit" element={<CommunityPostFormPage mode="edit" />} />
          </Route>

          {/* 관리자 — 비관리자는 404 렌더 */}
          <Route path="/admin" element={<AdminRoute />}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:userId" element={<AdminUserDetailPage />} />
            <Route path="codes" element={<AdminCodesPage />} />
            <Route path="managed" element={<AdminManagedPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          </Route>
        </Route>
      </Route>

      {/* 정의되지 않은 경로 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
