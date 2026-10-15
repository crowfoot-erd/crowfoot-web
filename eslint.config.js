import eslint from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'e2e', 'scripts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // SonarLint 계열 정적 분석 (SonarSource eslint-plugin-sonarjs)
  { ...sonarjs.configs.recommended, files: ['**/*.{ts,tsx}'] },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // 함수 복잡도 15 초과는 오류. 켜기 전부터 있던 함수는 eslint-suppressions.json 기준선으로 묶는다 —
      // 새로 넘는 함수는 막히고, 기준선 함수를 나누면 `pnpm lint --prune-suppressions`로 기준선에서 뺀다
      'sonarjs/cognitive-complexity': ['error', 15],
      // 짧은 중첩 삼항(JSX 분기·정렬 비교)이 프로젝트 관용구 — 취향 성격
      'sonarjs/no-nested-conditional': 'off',
      // className·메시지 조립의 중첩 템플릿 리터럴 — 가독성 취향 성격
      'sonarjs/no-nested-template-literals': 'off',
      // TODO는 백로그 표기로 허용 — 남은 일 추적은 docs 진행상황이 원천
      'sonarjs/todo-tag': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // feature 간 순환 참조 금지 (00-environment/frontend-environment.md Section 2.2)
      'import/no-cycle': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
)
