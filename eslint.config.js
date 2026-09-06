import * as config from '@lvce-editor/eslint-config'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  ...config.default,
  ...config.recommendedNode,
  {
    rules: {
      '@cspell/spellchecker': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      'no-console': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-objects': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-redundant-assignments': 'off',
      'unicorn/consistent-conditional-object-spread': 'off',
      'unicorn/isolated-functions': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-optional-chaining-on-undeclared-variable': 'off',
      'unicorn/no-useless-template-literals': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-array-some': 'off',
      'unicorn/prefer-await': 'off',
      'unicorn/prefer-minimal-ternary': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-top-level-await': 'off'
    }
  }
])
