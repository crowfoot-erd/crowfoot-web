/**
 * 테이블 스킨 — 프리셋 10색(hex)을 color-mix로 파생해 헤더 밴드·테두리에 얹는다.
 * note-skin의 자유 색 방식을 재사용 — 틴트라 밝기·다크 모드를 함께 견디고,
 * 색별 Tailwind 클래스 전개 없이 스키마의 hex만으로 렌더가 파생된다 (05-editor/02-ui.md §8.2).
 */
import type { CSSProperties } from 'react'

import { TABLE_COLOR_HEX, type TableColorValue } from '@/features/editor/model/content-schema'

export interface TableSkin {
  /** 헤더 밴드(논리명)에 얹는 인라인 배경 — 'default'면 undefined(기본 bg-primary/15) */
  bandStyle?: CSSProperties
  /** 상자 테두리 인라인 색 — 'default'면 undefined */
  borderStyle?: CSSProperties
  /** 축소(줌아웃) 라벨 판에 얹는 불투명 틴트 — 테마 --card와 혼합해 다크 모드를 함께 견딘다 */
  plateStyle?: CSSProperties
}

/** 색 → 스킨. 틴트 배경 + 테두리는 본색 — 글자는 테마 기본색이라 다크 모드에서도 읽힌다 */
export function tableSkin(color: TableColorValue): TableSkin {
  if (color === 'default') return {}
  const c = TABLE_COLOR_HEX[color]
  return {
    bandStyle: { backgroundColor: `color-mix(in srgb, ${c} 22%, transparent)` },
    borderStyle: { borderColor: `color-mix(in srgb, ${c} 55%, transparent)` },
    plateStyle: { backgroundColor: `color-mix(in srgb, ${c} 30%, var(--card))` },
  }
}

/** 색 → 원색 hex — 미니맵 nodeColor·스와치 배경용. 'default'면 null(기본 렌더) */
export function tableColorHex(color: TableColorValue): string | null {
  return color === 'default' ? null : TABLE_COLOR_HEX[color]
}
