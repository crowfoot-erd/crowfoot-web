// 배포 산물 주석 제거 — 개발 소스의 근거 주석은 그대로 두고, view-source·공개 다운로드로
// 실리는 정적 산물에서만 걷어낸다(2026-09-24 사용자 요청). pnpm build 마지막 단계로 실행되며
// dev 서버는 소스를 그대로 쓰므로 영향이 없다. 인덱스 근거는 docs 04-front/storyboard/00-common.md §3.11.
import { readFileSync, writeFileSync } from 'node:fs'

// index.html 인라인 <script> 안의 주석은 못 걷는다 — HTML 주석으로만 달아야 여기서 걷힌다.
const targets = [
  { path: 'dist/index.html', strip: (t) => t.replace(/<!--[\s\S]*?-->/g, '') },
  { path: 'dist/sitemap.xml', strip: (t) => t.replace(/<!--[\s\S]*?-->/g, '') },
  { path: 'dist/favicon.svg', strip: (t) => t.replace(/<!--[\s\S]*?-->/g, '') },
  { path: 'dist/logo.svg', strip: (t) => t.replace(/<!--[\s\S]*?-->/g, '') },
  { path: 'dist/robots.txt', strip: (t) => t.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n') },
]

// 주석이 빠진 자리에 빈 줄이 3개 이상 쌓이면 2개로 정리
const tidy = (t) => t.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')

let cleaned = 0
for (const { path, strip } of targets) {
  const before = readFileSync(path, 'utf8')
  const after = tidy(strip(before))
  if (after !== before) {
    writeFileSync(path, after)
    cleaned++
  }
}
process.stdout.write(`strip-deploy-comments: ${cleaned}/${targets.length} files cleaned\n`)
