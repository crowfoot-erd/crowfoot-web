/**
 * Toast UI Viewer 래퍼 (커뮤니티 게시글 상세 — 마크다운 렌더, 08-core/08-community.md)
 *
 * 게시글은 페이지당 1회 로드라 initialValue 변경 시 destroy 후 재생성한다(비용 무시).
 * 새니타이저는 패키지 기본값(DOMPurify 기반)을 유지 — 원시 HTML 삽입은 기본 차단.
 * 다크 모드 — 공식 다크 테마(.toastui-editor-dark 스코프)를 래퍼 클래스로 켠다.
 *   라이트 기본 본문색이 짙은 회글씨라 앱 배경만 다크일 때 글자가 배경에 묻힌다.
 */
import { useEffect, useRef } from 'react'

import Viewer from '@toast-ui/editor/dist/toastui-editor-viewer'
import '@toast-ui/editor/dist/toastui-editor-viewer.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

import { cn } from 'cn'
import { useTheme } from '@/lib/theme'

interface MarkdownViewerProps {
  markdown: string
  className?: string
}

export default function MarkdownViewer({ markdown, className }: MarkdownViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { resolved } = useTheme()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewer = new Viewer({ el: container, initialValue: markdown })
    return () => {
      viewer.destroy()
    }
  }, [markdown])

  return (
    <div
      ref={containerRef}
      className={cn(className, resolved === 'dark' && 'toastui-editor-dark')}
      data-testid="markdown-viewer"
    />
  )
}
