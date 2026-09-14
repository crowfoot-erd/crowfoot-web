/**
 * 메모 스킨 — 프리셋 5색은 Tailwind 클래스, 자유 색(#rrggbb)은 color-mix 파생 인라인 스타일.
 * Tailwind JIT가 전체 클래스명을 필요로 해 프리셋은 색상별로 전개한다 (05-editor/02-ui.md §7).
 */
import type { CSSProperties } from 'react'

import { cn } from 'cn'
import { NOTE_COLORS, isNoteHex, type NoteColor } from '@/features/editor/model/content-schema'

export interface NoteSkin {
  /** 박스(외곽) — 클래스 */
  box: string
  /** 헤더 밴드 — 클래스 */
  band: string
  /** 색 점 스와치 — 클래스(프리셋) 또는 인라인 배경색(자유 색) */
  dot: string
  /** 자유 색일 때 박스에 얹는 인라인 스타일 */
  boxStyle?: CSSProperties
  /** 자유 색일 때 밴드에 얹는 인라인 스타일 */
  bandStyle?: CSSProperties
  /** 자유 색일 때 색 점 인라인 배경색 */
  dotStyle?: CSSProperties
}

const PRESET_SKINS: Record<NoteColor, { box: string; band: string; dot: string }> = {
  yellow: {
    box: 'border-amber-300/70 bg-amber-50/90 text-amber-950 dark:border-amber-600/50 dark:bg-amber-950/60 dark:text-amber-100',
    band: 'bg-amber-200/70 dark:bg-amber-900/40',
    dot: 'bg-amber-400 dark:bg-amber-600',
  },
  green: {
    box: 'border-emerald-300/70 bg-emerald-50/90 text-emerald-950 dark:border-emerald-600/50 dark:bg-emerald-950/60 dark:text-emerald-100',
    band: 'bg-emerald-200/70 dark:bg-emerald-900/40',
    dot: 'bg-emerald-400 dark:bg-emerald-600',
  },
  blue: {
    box: 'border-sky-300/70 bg-sky-50/90 text-sky-950 dark:border-sky-600/50 dark:bg-sky-950/60 dark:text-sky-100',
    band: 'bg-sky-200/70 dark:bg-sky-900/40',
    dot: 'bg-sky-400 dark:bg-sky-600',
  },
  pink: {
    box: 'border-pink-300/70 bg-pink-50/90 text-pink-950 dark:border-pink-600/50 dark:bg-pink-950/60 dark:text-pink-100',
    band: 'bg-pink-200/70 dark:bg-pink-900/40',
    dot: 'bg-pink-400 dark:bg-pink-600',
  },
  purple: {
    box: 'border-violet-300/70 bg-violet-50/90 text-violet-950 dark:border-violet-600/50 dark:bg-violet-950/60 dark:text-violet-100',
    band: 'bg-violet-200/70 dark:bg-violet-900/40',
    dot: 'bg-violet-400 dark:bg-violet-600',
  },
}

/** 자유 색 표기 헬퍼 — 프리셋 이름이면 스와치 배경용 hex로 변환 */
export const PRESET_HEX: Record<NoteColor, string> = {
  yellow: '#fbbf24',
  green: '#34d399',
  blue: '#38bdf8',
  pink: '#f472b6',
  purple: '#a78bfa',
}

/** 색 → 스킨. 자유 색은 테마 토큰과 혼합해 밝기·다크 모드를 함께 견딘다 */
export function noteSkin(color: string): NoteSkin {
  const preset = NOTE_COLORS.find((c) => c === color)
  if (preset) return PRESET_SKINS[preset]
  if (!isNoteHex(color)) return PRESET_SKINS.yellow // 스키마 밖 값 — 기본 프리셋으로
  const c = color.toLowerCase()
  return {
    // 틴트 배경 + 테두리는 본색, 글자는 테마 기본색 — 다크 모드에서도 읽힌다
    box: cn('text-foreground'),
    band: '',
    dot: '',
    boxStyle: {
      borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
      backgroundColor: `color-mix(in srgb, ${c} 10%, transparent)`,
    },
    bandStyle: { backgroundColor: `color-mix(in srgb, ${c} 28%, transparent)` },
    dotStyle: { backgroundColor: c },
  }
}

export { NOTE_COLORS }
