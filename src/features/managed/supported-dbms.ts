/**
 * 매니지드 발급 지원 DBMS (08-core/07 §1) — 드롭다운 옵션 필터·기본 포트.
 * 표시명은 공개 database-types(코드 테이블) 것을 쓰고, 여기는 "지원 코드"만 둔다.
 * 최종 판정(전략 레지스트리)은 서버가 한다 — 신규 DBMS는 서버 프로비저너 추가와 함께 여기에 코드를 넣는다.
 */
export const MANAGED_DBMS_CODES = ['postgresql', 'mysql'] as const

export type ManagedDbmsCode = (typeof MANAGED_DBMS_CODES)[number]

/** DBMS 표준 기본 포트 — 폼 초기값·DBMS 전환 시 포트 자동 맞춤 */
export function managedDefaultPort(dbmsType: string): number | undefined {
  switch (dbmsType) {
    case 'postgresql':
      return 5432
    case 'mysql':
      return 3306
    default:
      return undefined
  }
}
