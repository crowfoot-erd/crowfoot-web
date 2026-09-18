/**
 * Toast UI Editor 래퍼 (커뮤니티 게시글 — 마크다운 작성, 08-core/08-community.md)
 *
 * React 19와 peer가 맞지 않는 @toast-ui/react-editor 대신 바닐라 @toast-ui/editor를
 * ref + useEffect로 직접 마운트한다(ReactDOM 미경유 — React 16~18 제약과 무관).
 * 인스턴스는 최초 1회만 생성하고 initialValue 변경으로 재생성하지 않는다(IME 커서 점프 방지).
 * 이미지는 업로드 API 없이 fileToDataUrl(base64)로 본문에 인라인 — 512KB 상한 초과 시 거부.
 */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
// 사이드이펙트 임포트 — Editor.setLanguage('ko-KR') 등록.
// exports 맵 "./dist/i18n/*" → "./dist/esm/i18n/*.js" 패턴이라 확장자를 붙이지 않는다
import '@toast-ui/editor/dist/i18n/ko-kr'

import { InlineImageTooLargeError, fileToDataUrl } from '@/lib/file-to-data-url'

interface MarkdownEditorProps {
  /** 최초 마운트 시 주입하는 원문 — 이후 변경은 반영하지 않는다(수정 화면은 remount로 초기화) */
  initialValue: string
  onChange: (markdown: string) => void
  height?: string
}

export default function MarkdownEditor({ initialValue, onChange, height = '420px' }: MarkdownEditorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 최신 콜백/문구를 쓰되 에디터 재생성은 일어나지 않도록 ref로만 전달
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const labelsRef = useRef({ tooLarge: t('community.form.imageTooLarge'), failed: t('community.form.imageFailed') })
  labelsRef.current = { tooLarge: t('community.form.imageTooLarge'), failed: t('community.form.imageFailed') }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const editor = new Editor({
      el: container,
      height,
      initialEditType: 'markdown',
      previewStyle: 'tab',
      usageStatistics: false,
      language: 'ko-KR',
      initialValue,
      hooks: {
        addImageBlobHook: (blob: Blob, callback: (url: string, altText: string) => void) => {
          // 런타임은 File을 넘기지만 타입은 Blob — 대체 텍스트는 파일명, 없으면 빈 칸
          const altText = blob instanceof File ? blob.name : ''
          void fileToDataUrl(blob)
            .then((url) => callback(url, altText))
            .catch((error: unknown) => {
              if (error instanceof InlineImageTooLargeError) {
                toast.error(labelsRef.current.tooLarge)
              } else {
                toast.error(labelsRef.current.failed)
              }
              // 거부 — 빈 문자열 콜백으로 본문 오염 방지
              callback('', '')
            })
        },
      },
    })
    editor.on('change', () => onChangeRef.current(editor.getMarkdown()))

    return () => {
      editor.destroy()
    }
    // 의존성 의도적 비움 — initialValue·콜백은 최초 1회만 반영, 재생성 금지(IME 커서 점프 방지)
  }, [])

  return <div ref={containerRef} data-testid="markdown-editor" />
}
