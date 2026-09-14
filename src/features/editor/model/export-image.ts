/**
 * ERD 이미지(PNG) 내보내기 (05-editor/02-ui.md §1.1 — 이미지 내보내기)
 *
 * 화면에 보이는 뷰포트가 아니라 **문서 전체 범위(모든 테이블·노트·관계선) + 여백**을 캡처한다.
 * 캔버스는 컬링 없이 항상 전체 노드를 렌더한다(팬 중 마운트 체인 끊김 방지 — ErdCanvas 참고)므로
 * 화면 밖 노드도 DOM에 그대로 있고, .react-flow__viewport를 전체 범위로 옮겨 찍고 원복한다.
 */
import { toPng } from 'html-to-image'
import type { Node, XYPosition } from '@xyflow/react'

/** RF 12의 Node 타입은 props용이라 positionAbsolute가 없다 — getNodes()가 주는 store 노드에는 있다 */
export type RfMeasuredNode = Node & { positionAbsolute?: XYPosition }

/** 캡처 여백(px) — 테이블 경계가 이미지 끝에 붙지 않게 */
export const IMAGE_PADDING = 40

export interface ExportBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 전체 노드(테이블·노트)의 bounding box — 문서 좌표계 기준.
 * RF 노드의 positionAbsolute + measured(실측)를 우선하고, 측정 전이면 스토어 좌표 + 0으로 폴백.
 * 노드가 없으면 null — 캡처할 게 없다는 뜻.
 */
export function nodesBoundingBox(nodes: RfMeasuredNode[]): ExportBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    const x = node.positionAbsolute?.x ?? node.position.x
    const y = node.positionAbsolute?.y ?? node.position.y
    const w = node.measured?.width ?? node.width ?? 0
    const h = node.measured?.height ?? node.height ?? 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  if (nodes.length === 0 || minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 캡처 배경색 — 캔버스에서 바깥으로 올라가며 처음 만나는 불투명 배경(테마 반영). 못 찾으면 흰색 */
export function resolveCanvasBackground(el: HTMLElement): string {
  let node: HTMLElement | null = el
  while (node) {
    const bg = getComputedStyle(node).backgroundColor
    if (bg && bg !== 'transparent' && !bg.endsWith(', 0)')) return bg
    node = node.parentElement
  }
  return '#ffffff'
}

/** React 커밋 + 페인트가 끝날 때까지 대기 — 최신 편집 내용이 화면에 반영된 뒤 범위를 계산하게 한다 */
export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * 캔버스 DOM을 전체 범위 PNG로 캡처해 dataURL을 반환한다.
 * canvasElement는 .react-flow 래퍼 — 그 안의 .react-flow__viewport를 찾아 이동·캡처·원복한다.
 * 실패해도 viewport transform은 원복한다(finally).
 */
export async function captureErdPng(
  canvasElement: HTMLElement,
  bounds: ExportBounds,
  background: string,
): Promise<string> {
  const viewport = canvasElement.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport) throw new Error('react-flow viewport not found')

  const width = bounds.width + IMAGE_PADDING * 2
  const height = bounds.height + IMAGE_PADDING * 2
  const prevTransform = viewport.style.transform

  viewport.style.transform = `translate(0px, 0px) scale(1)`
  try {
    return await toPng(viewport, {
      backgroundColor: background,
      pixelRatio: 2,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${IMAGE_PADDING - bounds.x}px, ${IMAGE_PADDING - bounds.y}px) scale(1)`,
      },
    })
  } finally {
    viewport.style.transform = prevTransform
  }
}
