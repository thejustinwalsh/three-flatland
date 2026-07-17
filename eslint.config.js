import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

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
  {
    files: ['minis/driller/src/**/*.{ts,tsx}'],
    plugins: {
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
    },
    rules: reactYouMightNotNeedAnEffect.configs.strict.rules,
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
      // Deliberately outside any tsconfig — sample/test data scanned by our
      // own Rust codelens sidecar's parser, not by tsc. Without this,
      // typescript-eslint's project service flags every fixture .ts file as
      // "not found by the project service" whenever opened in this workspace.
      'tools/vscode/e2e/fixtures/**',
    ],
  }
)
