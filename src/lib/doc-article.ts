/**
 * 문서형 본문(사용 가이드, 릴리스 노트)의 공통 모양 — 제목 스타일, 그림 배율, 그림 설명
 *
 * 그림은 실제 화면을 일정한 배율로 찍은 것이다. 그림 px을 pixelRatio로 나눈 폭으로 보여 주면 어느 그림이든 같은 배율로 보인다
 * (2026-10-03 사용자 지적 — 작은 메뉴는 크게, 넓은 화면은 작게 보여 보기 불편했다). 본문보다 넓으면 본문 폭에 맞춰 줄인다.
 * 그림 아래에는 대체 문구를 설명으로 붙인다.
 */
import { useEffect, type RefObject } from 'react'

import { cn } from '@/lib/utils'

/** 본문 스타일 — 절(h2)은 크게 아래 선으로, 소제목(h3)은 왼쪽 색 선으로, 그림은 둥근 테두리와 그림자로 */
export const DOC_ARTICLE_CLASS = cn(
  '[&_h2]:scroll-mt-20 [&_h2]:mt-14! [&_h2]:mb-5! [&_h2]:border-b! [&_h2]:pb-3! [&_h2]:text-2xl! [&_h2]:font-extrabold! [&_h2]:tracking-tight [&_h2:first-of-type]:mt-2!',
  '[&_h3]:scroll-mt-20 [&_h3]:mt-10! [&_h3]:mb-3! [&_h3]:border-l-4! [&_h3]:border-emerald-500! [&_h3]:pl-3! [&_h3]:text-lg! [&_h3]:font-bold!',
  '[&_p]:leading-7! [&_li]:leading-7! [&_table]:text-sm!',
  '[&_img]:mt-4! [&_img]:mb-1! [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-xl [&_img]:border [&_img]:bg-muted/30 [&_img]:shadow-sm',
  '[&_.doc-caption]:mb-5 [&_.doc-caption]:block [&_.doc-caption]:text-xs [&_.doc-caption]:text-muted-foreground',
)

/**
 * 본문의 그림을 같은 배율로 맞추고 설명을 붙인다. 뷰어가 본문을 늦게 그리므로 바뀔 때마다 다시 본다.
 * @param pixelRatio 그림 px 대 보여 줄 화면 px — 사용 가이드는 2(촬영 1.6배 ÷ 보여 줄 0.8배), 릴리스 노트는 2(레티나 2배 촬영을 1배로)
 */
export function useDocImages(ref: RefObject<HTMLElement | null>, ready: unknown, pixelRatio: number): void {
  useEffect(() => {
    const article = ref.current
    if (!article || !ready) return
    const fit = (image: HTMLImageElement) => {
      if (image.naturalWidth > 0) image.style.width = `${image.naturalWidth / pixelRatio}px`
    }
    const scan = () => {
      for (const image of article.querySelectorAll('img')) {
        if (image.dataset.docImage) continue
        image.dataset.docImage = '1'
        if (image.complete) fit(image)
        else image.addEventListener('load', () => fit(image), { once: true })
        if (image.alt) {
          const caption = document.createElement('span')
          caption.className = 'doc-caption'
          caption.textContent = image.alt
          image.after(caption)
        }
      }
    }
    scan()
    const observer = new MutationObserver(scan)
    observer.observe(article, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [ref, ready, pixelRatio])
}
