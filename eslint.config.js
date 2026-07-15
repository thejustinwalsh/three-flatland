import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['/scripts/*.ts', '/eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  // React hooks rules (includes React Compiler lint rules)
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The compiler flags creating a resource inside an effect and exposing
      // it through setState. usePane/usePaneFolder do this deliberately: the
      // pane/folder is built from a prop that changes (parent/title) and then
      // surfaced to consumers on the next render — an intentional, documented
      // two-render sequence, not a cascading-render bug. Keep it visible as a
      // warning rather than a CI-blocking error.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // ── PORTED-PACKAGE EXEMPTION ────────────────────────────────────────────────
  // packages/uikit* are vendored from pmndrs/uikit (MIT). This repo's stricter
  // rules govern code we author; holding a port to them would mean rewriting ~320
  // sites of upstream code and diverging from the source we intend to track. Same
  // principle as the no-arg constructor exemption in root CLAUDE.md.
  //
  // Scoped to vendored code. New code written inside these packages — the TSL panel
  // material, the Slug text renderer — still meets the repo bar. Hold that line.
  {
    files: [
      'packages/uikit/src/**/*.{ts,tsx}',
      'packages/uikit-default/src/**/*.{ts,tsx}',
      'packages/uikit-horizon/src/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      // upstream leaves unused bindings; keep visible but non-blocking for vendored code
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/vendor/**',
      '**/*.config.ts',
      '**/*.config.js',
      '**/*.setup.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      'examples/**',
    ],
  }
)
