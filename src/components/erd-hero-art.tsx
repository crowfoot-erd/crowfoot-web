/**
 * 랜딩 히어로 ERD 일러스트 — 카우풋 다이어그램을 인라인 SVG로 묘사 (2026-09-15)
 *
 * 이미지 에셋 대신 SVG: 테마 토큰(fill-* / stroke-*)이라 라이트·다크 모드가 자동 적용되고
 * 어떤 해상도에서도 선명하다. users 1─N workspaces 1─N models 관계를 담았다.
 */
export function ErdHeroArt() {
  return (
    <svg
      viewBox="0 0 800 400"
      role="img"
      aria-label="users·workspaces·models 테이블이 카우풋 표기법으로 연결된 ERD 일러스트"
      className="h-auto w-full"
    >
      {/* 캔버스 점 배경 — 에디터 그리드 느낌 */}
      <defs>
        <pattern id="erd-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" className="fill-muted-foreground/30" />
        </pattern>
      </defs>
      <rect width="800" height="400" className="fill-muted/40" />
      <rect width="800" height="400" fill="url(#erd-grid)" />

      {/* 관계선 — 카우풋: 한쪽(1)은 단일 바, 여럿(N)은 갈퀴 */}
      <g className="stroke-foreground/70" fill="none" strokeWidth="1.5">
        {/* users.id ─ workspaces.owner_id : users가 1 */}
        <path d="M250 205 H300" />
        <path d="M250 199 V211 M238 199 V211" />
        {/* workspaces.id ─ models.workspace_id : models가 N */}
        <path d="M510 135 H556" />
        <path d="M556 135 L544 129 M556 135 L544 141 M556 135 H544" />
        <path d="M498 129 V141" />
      </g>

      {/* users */}
      <g>
        <rect x="50" y="120" width="200" height="170" rx="8" className="fill-background stroke-border" strokeWidth="1.5" />
        <path d="M50 154 H250" className="stroke-border" strokeWidth="1.5" />
        <rect x="50" y="120" width="200" height="34" rx="8" className="fill-muted" />
        <rect x="50" y="140" width="200" height="14" className="fill-muted" />
        <text x="62" y="142" fontSize="13" fontWeight="600" className="fill-foreground font-mono">users</text>
        <Row y={178} name="id" tag="PK" type="BIGINT" />
        <Row y={206} name="email" tag="UK" type="VARCHAR(255)" />
        <Row y={234} name="name" type="VARCHAR(100)" />
        <Row y={262} name="created_at" type="TIMESTAMP" />
      </g>

      {/* workspaces */}
      <g>
        <rect x="300" y="70" width="210" height="130" rx="8" className="fill-background stroke-border" strokeWidth="1.5" />
        <path d="M300 104 H510" className="stroke-border" strokeWidth="1.5" />
        <rect x="300" y="70" width="210" height="34" rx="8" className="fill-muted" />
        <rect x="300" y="90" width="210" height="14" className="fill-muted" />
        <text x="312" y="92" fontSize="13" fontWeight="600" className="fill-foreground font-mono">workspaces</text>
        <Row y={128} x={312} name="id" tag="PK" type="BIGINT" />
        <Row y={156} x={312} name="owner_id" tag="FK" type="BIGINT" />
        <Row y={184} x={312} name="name" type="VARCHAR(100)" />
      </g>

      {/* models */}
      <g>
        <rect x="556" y="100" width="200" height="198" rx="8" className="fill-background stroke-border" strokeWidth="1.5" />
        <path d="M556 134 H756" className="stroke-border" strokeWidth="1.5" />
        <rect x="556" y="100" width="200" height="34" rx="8" className="fill-muted" />
        <rect x="556" y="120" width="200" height="14" className="fill-muted" />
        <text x="568" y="122" fontSize="13" fontWeight="600" className="fill-foreground font-mono">models</text>
        <Row y={158} x={568} name="id" tag="PK" type="BIGINT" />
        <Row y={186} x={568} name="workspace_id" tag="FK" type="BIGINT" />
        <Row y={214} x={568} name="name" type="VARCHAR(255)" />
        <Row y={242} x={568} name="database_type" type="VARCHAR(20)" />
        <Row y={270} x={568} name="content" type="JSONB" />
      </g>
    </svg>
  )
}

/** 테이블 행 — 컬럼명·키 배지(PK/FK/UK)·타입 */
function Row({ y, x = 62, name, tag, type }: { y: number; x?: number; name: string; tag?: string; type: string }) {
  return (
    <>
      {tag ? (
        <text x={x + 18} y={y} fontSize="10" fontWeight="700" className="fill-primary font-mono">{tag}</text>
      ) : null}
      <text x={x + (tag ? 38 : 0)} y={y} fontSize="12" className="fill-foreground font-mono">{name}</text>
      <text x={x + 176} y={y} fontSize="10" textAnchor="end" className="fill-muted-foreground font-mono">{type}</text>
    </>
  )
}
