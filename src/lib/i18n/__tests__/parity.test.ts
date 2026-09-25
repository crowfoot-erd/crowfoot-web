/**
 * i18n 리소스 패리티 (storyboard 00-common §3.3) — ko·en·ja·zh 4개 json의
 * 키 집합·placeholder·빈값·중첩 구조가 어긋나면 게이트 red.
 * 이후 키 추가 시 4벌에 동시 반영하지 않으면 여기서 잡힌다.
 */
import { describe, expect, it } from 'vitest'

import en from '../en.json'
import ja from '../ja.json'
import ko from '../ko.json'
import zh from '../zh.json'

const BUNDLES: Record<string, unknown> = { ko, en, ja, zh }
const LANGS = Object.keys(BUNDLES)

interface FlatEntry {
  key: string
  value: unknown
}

/** 재귀 플래튼 — 배열 항목은 path.0·path.1… 경로로 펼친다(terms.sections 조항 등) */
function flatten(node: unknown, prefix = ''): FlatEntry[] {
  if (node === null || typeof node !== 'object') {
    throw new Error(`리소스는 중첩 객체·배열만 허용한다 — ${prefix}`)
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, index) =>
      item !== null && typeof item === 'object'
        ? flatten(item, `${prefix}.${index}`)
        : [{ key: `${prefix}.${index}`, value: item }],
    )
  }
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value !== null && typeof value === 'object'
      ? flatten(value, path)
      : [{ key: path, value }]
  })
}

function stringEntries(node: unknown): Map<string, string> {
  const entries = flatten(node).filter((entry) => typeof entry.value === 'string') as {
    key: string
    value: string
  }[]
  return new Map(entries.map((entry) => [entry.key, entry.value] as const))
}

/** 컨테이너 모양 경로 — 객체는 path:{} 배열은 path:[] 태그. 4벌이 같은 자리에 같은 모양이어야
 *  returnObjects 소비(t(..., { returnObjects: true }) 후 .map/.length)가 깨지지 않는다 */
function shapeKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) {
    return [
      `${prefix}:[]`,
      ...node.flatMap((item, index) =>
        item !== null && typeof item === 'object' ? shapeKeys(item, `${prefix}.${index}`) : [],
      ),
    ]
  }
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value === null) return []
    if (Array.isArray(value)) return [`${path}:[]`, ...shapeKeys(value, path)]
    if (typeof value === 'object') return [`${path}:{}`, ...shapeKeys(value, path)]
    return []
  })
}

function placeholders(value: string): Set<string> {
  return new Set(value.match(/\{\{[^}]+}}/g) ?? [])
}

describe('i18n 리소스 패리티', () => {
  it('4개 언어의 키 집합이 ko와 정확히 같다', () => {
    const koKeys = new Set(stringEntries(ko).keys())
    expect(koKeys.size).toBeGreaterThan(1000) // 1,044키 — 우발적 대량 삭제 방지

    for (const lang of LANGS) {
      const keys = new Set(stringEntries(BUNDLES[lang]).keys())
      const missing = [...koKeys].filter((key) => !keys.has(key))
      const extra = [...keys].filter((key) => !koKeys.has(key))
      expect(missing, `${lang}에 없는 키`).toEqual([])
      expect(extra, `${lang}에만 있는 키`).toEqual([])
    }
  })

  it('값이 비었거나 공백만 있는 키가 없다', () => {
    for (const lang of LANGS) {
      for (const [key, value] of stringEntries(BUNDLES[lang])) {
        expect(value.trim().length, `${lang}.${key} 값이 비었다`).toBeGreaterThan(0)
      }
    }
  })

  it('placeholder({{name}} 등) 집합이 4개 언어 모두 같다', () => {
    const koEntries = stringEntries(ko)
    for (const lang of LANGS) {
      const entries = stringEntries(BUNDLES[lang])
      for (const [key, value] of koEntries) {
        expect([...placeholders(value)].sort(), `${lang}.${key} placeholder`).toEqual(
          [...placeholders(entries.get(key) ?? '')].sort(),
        )
      }
    }
  })

  it('중첩 구조(객체·배열 자리)가 4개 언어 모두 같다 — returnObjects 소비 호환', () => {
    const koShapes = shapeKeys(ko).sort()
    for (const lang of LANGS) {
      expect(shapeKeys(BUNDLES[lang]).sort(), `${lang} 컨테이너 모양`).toEqual(koShapes)
    }
  })
})
