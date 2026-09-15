/**
 * 라우팅 (storyboard 00-common §2.3 — 직접 URL 접근 규칙)
 *
 * /·/login·/auth/callback·/terms 공개(게스트 랜딩·로그인·콜백·이용약관) / 나머지 ProtectedRoute →
 * AppLayout 셸 / /admin/* AdminRoute / catch-all 404. 탭 상태(WS 멤버·설정)는 쿼리 파라미터로 유지된다.
 */
import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminRoute } from '@/routes/admin-route'
import { ProtectedRoute } from '@/routes/protected-route'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthCallbackPage } from '@/pages/auth-callback'
import { DashboardPage } from '@/pages/dashboard'
import { LandingPage } from '@/pages/landing'
import { LoginPage } from '@/pages/login'
import { TermsPage } from '@/pages/terms'
import { ModelViewerPage } from '@/pages/model-viewer'
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

export function AppRoutes() {
  return (
    <Routes>
      {/* 공개 — 셸 없음 */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/terms" element={<TermsPage />} />

      {/* 보호 — 앱 셸 4분할 */}
      <Route element={<ProtectedRoute />}>
        {/* 문서 열기 — 새 창 전체 화면(셸 없음), ERD 탭의 이름·돋보기로 진입 */}
        <Route path="/workspaces/:workspaceId/models/:modelId" element={<ModelViewerPage />} />

        <Route element={<AppLayout />}>
          {/* 앱 홈 — 게스트 / 는 랜딩(소개) 페이지가 담당한다 */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/teams/:teamId" element={<TeamDetailPage />} />

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
