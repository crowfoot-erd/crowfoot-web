/**
 * 생성 다이얼로그 전역 상태 — 사이드바·대시보드·목록 3곳에서 오픈 (storyboard S-04)
 */
import { create } from 'zustand'

interface CreateWorkspaceDialogState {
  open: boolean
  openDialog: () => void
  closeDialog: () => void
}

export const useCreateWorkspaceDialog = create<CreateWorkspaceDialogState>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}))
