/**
 * Toast UI Editor 래퍼 (커뮤니티 게시글 — 마크다운 작성, 08-core/08-community.md)
 *
 * React 19와 peer가 맞지 않는 @toast-ui/react-editor 대신 바닐라 @toast-ui/editor를
 * ref + useEffect로 직접 마운트한다(ReactDOM 미경유 — React 16~18 제약과 무관).
 * 인스턴스는 최초 1회만 생성하고 initialValue 변경으로 재생성하지 않는다(IME 커서 점프 방지).
 * 에디터 UI 문구의 로케일(language prop)도 마운트 시 고정 — 언어 탭은 key 교체 리마운트로 갱신.
 * 이미지는 업로드 API 없이 fileToDataUrl(base64)로 본문에 인라인 — 512KB 상한 초과 시 거부.
 */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'

import { InlineImageTooLargeError, fileToDataUrl } from '@/lib/file-to-data-url'
import { INTL_LOCALES, currentLanguage } from '@/lib/i18n'

/** 에디터 UI 문구 로케일 청크 — en-US는 에디터 기본 내장(번들 파일 없음).
 *  정적 분기로 두어 각 언어가 별도 청크로 분리된다(exports 맵 "./dist/i18n/*" → "./dist/esm/i18n/*.js"). */
async function loadEditorLocale(locale: string): Promise<void> {
  if (locale === 'ko-KR') await import('@toast-ui/editor/dist/i18n/ko-kr')
  else if (locale === 'ja-JP') await import('@toast-ui/editor/dist/i18n/ja-jp')
  else if (locale === 'zh-CN') await import('@toast-ui/editor/dist/i18n/zh-cn')
}

interface MarkdownEditorProps {
  /** 최초 마운트 시 주입하는 원문 — 이후 변경은 반영하지 않는다(수정 화면은 remount로 초기화) */
  initialValue: string
  onChange: (markdown: string) => void
  height?: string
  /** 에디터 UI 문구 로케일(INTL_LOCALES 값) — 기본은 현재 UI 언어. 마운트 시 1회만 반영 */
  language?: string
}

export default function MarkdownEditor({
  initialValue,
  onChange,
  height = '420px',
  language,
}: MarkdownEditorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  // 최신 콜백/문구를 쓰되 에디터 재생성은 일어나지 않도록 ref로만 전달
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const labelsRef = useRef({ tooLarge: t('community.form.imageTooLarge'), failed: t('community.form.imageFailed') })
  labelsRef.current = { tooLarge: t('community.form.imageTooLarge'), failed: t('community.form.imageFailed') }
  const localeRef = useRef(language ?? INTL_LOCALES[currentLanguage()])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let editor: Editor | null = null
    let disposed = false
    void loadEditorLocale(localeRef.current).then(() => {
      // 언어 청크 로드 사이 언마운트됐으면 에디터를 만들지 않는다
      if (disposed || containerRef.current !== container) return
      editor = new Editor({
        el: container,
        height,
        initialEditType: 'markdown',
        previewStyle: 'tab',
        usageStatistics: false,
        language: localeRef.current,
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
      editor.on('change', () => onChangeRef.current(editor!.getMarkdown()))
    })

    return () => {
      disposed = true
      editor?.destroy()
    }
    // 의존성 의도적 비움 — initialValue·콜백·language는 최초 1회만 반영, 재생성 금지(IME 커서 점프 방지)
  }, [])

  return <div ref={containerRef} data-testid="markdown-editor" />
}
