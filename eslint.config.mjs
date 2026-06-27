// @ts-check
import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import { configs as typescript } from 'typescript-eslint'
import { configs as angular, processInlineTemplates } from 'angular-eslint'

export default defineConfig([
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, typescript.recommended, angular.tsRecommended],
    processor: processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'sp',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'sp',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.templateRecommended],
    rules: {},
  },
])
