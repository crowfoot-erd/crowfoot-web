/**
 * 템플릿 카드 한국어 표기맵 (08-core/09-templates.md §3 — 카드 표기는 한국어 단일)
 *
 * 쇼케이스 6종은 "문서당 언어 1개" 완전 현지화(en/ja/zh)라 목록 메타가 그 언어로 내려온다.
 * 템플릿 목록은 제품의 앞문이라 카드 이름·설명·복제 기본 이름은 사이트 언어와 무관하게
 * 한국어로 통일한다 — 문서 자체(공개 뷰어·content)는 현지화 그대로 유지된다.
 * 한국어 원문은 발행 시점의 것(docs assets 생성기·발행 기록)이며, 여기 없는 modelId는
 * 문서 메타 그대로 나간다(폴백 — 한국어 문서·향후 신규 템플릿). 새 템플릿을 현지화로
 * 발행하면 한국어 메타를 여기에도 추가한다.
 */
import type { TemplateSummary } from '@/api/types'

const KOREAN: Record<string, { name: string; description: string }> = {
  // v1.18 쇼케이스 — 현지화 6종(블로그·커뮤니티·SaaS·병원·IoT·도서관). 쇼핑몰(79)·인사(85)는 한국어 문서라 폴백
  '80': {
    name: '블로그 CMS ERD',
    description:
      '블로그 콘텐츠 관리 스키마 — 포스트×태그 N:M, 대댓글 셀프 참조, URL 슬러그 유니크 키를 포함합니다. 카테고리·메뉴 계층 구조와 뉴스레터 구독자 관리까지 담은 ERD입니다.',
  },
  '81': {
    name: '커뮤니티 ERD',
    description:
      '게시판 커뮤니티 스키마 — 게시판·글·댓글·반응·쪽지·신고 도메인을 주제 영역 3개로 나눈 ERD. 글 상태 컬럼(PUBLISHED/HIDDEN/BLINDED), 이모지 반응 복합 유니크 키, 계층 댓글을 포함합니다.',
  },
  '82': {
    name: 'SaaS 구독 결제 ERD',
    description:
      'B2B SaaS 과금 스키마 — 조직(테넌트)·구독·인보이스·결제 수단 도메인 ERD. 조직 1:1 청구 담당자, 인보이스 라인 복합 유니크 키, API 키·사용량 기록을 포함합니다.',
  },
  '83': {
    name: '병원 예약 ERD',
    description:
      '병원 진료 예약 스키마 — 환자·의사·진료과·예약 슬롯·진료기록·처방 도메인 ERD. 예약과 진료기록의 1:1, 슬롯 중복 예약 방지 유니크 키, 도메인 규칙 메모를 포함합니다.',
  },
  '84': {
    name: 'IoT 센서 시계열 ERD',
    description:
      'IoT 센서 수집 스키마 — 사이트·게이트웨이·디바이스·센서·측정값 도메인 ERD. 측정값 테이블의 복합 인덱스(sensor_id + 측정시각)와 월 파티셔닝 전략 메모를 포함합니다.',
  },
  '86': {
    name: '도서관 대출 ERD',
    description:
      '도서관 관리 스키마 — 도서·저자·출판사·대출 회원·대출·예약 도메인 ERD. 도서×저자 N:M 배정(저자 순서 보존), ISBN 유니크 키, 반납 예정일과 예약 대기 관리를 포함합니다.',
  },
}

/** 템플릿 카드 표기 — 표시맵의 한국어가 우선, 없으면 문서 메타 그대로(폴백) */
export function templateDisplay(template: Pick<TemplateSummary, 'modelId' | 'name' | 'description'>) {
  const korean = KOREAN[template.modelId]
  return korean ?? { name: template.name, description: template.description ?? '' }
}
