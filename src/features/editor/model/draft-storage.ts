/**
 * 에디터 임시 저장(draft) — localStorage 기반 (05-editor/02-ui.md §1.1 저장 파이프라인)
 *
 * 자동 저장(2s debounce) 사이에 페이지가 재로드·닫기되는 순간(배포 중단, 강제 새로고침)을
 * 커버한다 — 에디터 스토어는 메모리 전용이라 재로드되면 dirty 편집이 사라진다.
 * · 쓰기: 저장 시도(putContent)마다 서버 PUT에 앞서 먼저 남긴다. 저장이 성공하면 폐기.
 * · 복원: 문서를 다시 열 때 draft.baseVersion이 서버 version과 같을 때만 수화한다
 *   (다르면 서버가 앞선 것이다 — 임시본을 폐기하고 서버 본문으로 연다).
 * 쿼터 초과·시크릿 모드 등 쓰기 실패는 조용히 무시된다 — 서버 저장이 원천 경로이므로.
 */
export interface EditorDraft {
  /** 임시본이 시작된 문서 버전 — 복원 가능 여부 판정에 쓴다 */
  baseVersion: number
  /** serializeContent 결과 본문 그대로 */
  content: string
  /** 기록 시각(ms) — 진단용 */
  savedAt: number
}

const KEY_PREFIX = 'crowfoot:editor-draft:'

export function draftKey(workspaceId: string, modelId: string): string {
  return `${KEY_PREFIX}${workspaceId}:${modelId}`
}

/** 임시본 기록 — 실패(쿼터 등)해도 예외를 던지지 않는다 */
export function saveDraft(workspaceId: string, modelId: string, draft: EditorDraft): boolean {
  try {
    window.localStorage.setItem(draftKey(workspaceId, modelId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/** 임시본 읽기 — 없거나 깨졌으면 null */
export function loadDraft(workspaceId: string, modelId: string): EditorDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(workspaceId, modelId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EditorDraft> | null
    if (
      !parsed ||
      typeof parsed.baseVersion !== 'number' ||
      typeof parsed.content !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null
    }
    return { baseVersion: parsed.baseVersion, content: parsed.content, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

/** 임시본 폐기 — 저장 성공(서버가 원천이 된 순간)·버전이 어긋난 복원 불가본 정리 */
export function clearDraft(workspaceId: string, modelId: string): void {
  try {
    window.localStorage.removeItem(draftKey(workspaceId, modelId))
  } catch {
    // 삭제 실패는 다음 복원 시 baseVersion 판정이 다시 걸러낸다
  }
}
