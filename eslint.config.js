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
      // 큰 편집기 컴포넌트·배치 알고리즘에 몰리는 체계적 지표 — 분해는 별도 리팩터링 과제로 다룬다
      'sonarjs/cognitive-complexity': 'off',
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
