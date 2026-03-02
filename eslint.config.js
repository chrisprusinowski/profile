import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'merit-bonus/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['packages/api/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly'
      }
    }
  },
  {
    files: ['packages/web/**/*.js'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        localStorage: 'readonly',
        document: 'readonly'
      }
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
);
