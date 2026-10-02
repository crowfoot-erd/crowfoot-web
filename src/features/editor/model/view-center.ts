/**
 * 지금 보이는 화면의 가운데(캔버스 좌표) — 다른 문서에서 복사한 것을 붙여 넣을 자리 (05-editor/02-ui.md §9)
 *
 * 캔버스(ErdCanvas)만 화면 좌표를 캔버스 좌표로 바꿀 수 있다. 단축키는 EditorShell이 받으므로,
 * 캔버스가 계산 함수를 여기에 걸어 두고 셸이 불러 쓴다.
 */
type Point = { x: number; y: number }

let provider: (() => Point | null) | null = null

export function setViewCenterProvider(next: (() => Point | null) | null): void {
  provider = next
}

export function currentViewCenter(): Point | null {
  return provider ? provider() : null
}
