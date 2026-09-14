/**
 * .crown 문서 파일 — ERD 문서 하나를 통째로 저장·복원하는 JSON 봉투 (05-editor/00-overview.md §5)
 *
 * 봉투는 문서 본체(canonical content v1)와 모델 메타(이름·설명·DB 종류)를 함께 싣는다.
 * content 검증·정규화는 content-io를 그대로 재사용한다 — 봉투는 format·version 판별만 담당.
 */
import { parseContent } from '@/features/editor/model/content-io'
import type { EditorDocument, ErdContent } from '@/features/editor/model/content-schema'

export const CROWN_FORMAT = 'crowfoot-crown'
export const CROWN_VERSION = 1

export interface CrownModelMeta {
  name: string
  description: string | null
  databaseType: string
}

export interface CrownFile {
  format: typeof CROWN_FORMAT
  version: number
  exportedAt: string
  model: CrownModelMeta
  content: ErdContent
}

/** 파싱 실패 사유 — 호출부가 안내 문구(i18n)로 바꾼다 */
export type CrownParseErrorCode = 'SYNTAX' | 'NOT_CROWN' | 'NEWER_VERSION' | 'INVALID_MODEL' | 'INVALID_CONTENT'

export class CrownParseError extends Error {
  readonly code: CrownParseErrorCode

  constructor(code: CrownParseErrorCode, cause?: unknown) {
    super(code, { cause })
    this.code = code
  }
}

/** 내보내기 — 편집 문서(EditorDocument)를 저장본 형태(schemaVersion 결합)로 봉투에 싣는다.
 *  사람이 읽을 수 있게 2칸 들여쓰기로 기록한다(문서 백업·버전 관리 대상). */
export function buildCrownFile(model: CrownModelMeta, document: EditorDocument, exportedAt: string): string {
  const content: ErdContent = { schemaVersion: 1, model: document.model, diagram: document.diagram }
  const file: CrownFile = {
    format: CROWN_FORMAT,
    version: CROWN_VERSION,
    exportedAt,
    model: {
      name: model.name,
      description: model.description ?? null,
      databaseType: model.databaseType,
    },
    content,
  }
  return JSON.stringify(file, null, 2)
}

/** 가져오기 — 봉투 판별→메타 검증→content 스키마 검증·정규화. 실패는 CrownParseError */
export function parseCrownFile(raw: string): CrownFile {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    throw new CrownParseError('SYNTAX', error)
  }
  if (typeof json !== 'object' || json === null) throw new CrownParseError('NOT_CROWN')
  const envelope = json as Record<string, unknown>
  if (envelope.format !== CROWN_FORMAT) throw new CrownParseError('NOT_CROWN')
  const version = envelope.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new CrownParseError('NOT_CROWN')
  }
  if (version > CROWN_VERSION) throw new CrownParseError('NEWER_VERSION')

  const rawModel = envelope.model
  if (typeof rawModel !== 'object' || rawModel === null) throw new CrownParseError('INVALID_MODEL')
  const m = rawModel as Record<string, unknown>
  const name = typeof m.name === 'string' ? m.name.trim() : ''
  const description =
    m.description === undefined || m.description === null ? null : typeof m.description === 'string' ? m.description : undefined
  const databaseType = typeof m.databaseType === 'string' ? m.databaseType.trim() : ''
  if (!name || description === undefined || !databaseType) throw new CrownParseError('INVALID_MODEL')

  let content: ErdContent
  try {
    // parseContent가 zod 스키마 검증·레거시 정규화(v0·boolean 선택성·컬럼 3영역)를 모두 수행한다
    content = parseContent(JSON.stringify(envelope.content ?? null))
  } catch (error) {
    throw new CrownParseError('INVALID_CONTENT', error)
  }

  return {
    format: CROWN_FORMAT,
    version,
    exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : '',
    model: { name, description, databaseType },
    content,
  }
}
