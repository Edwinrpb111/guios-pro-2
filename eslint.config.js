import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'supabase/functions', 'docs'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Principio rector (BRIEF §8.2): guios-core es TypeScript puro y no conoce
    // la interfaz ni la base de datos. Solo puede importar archivos de su
    // propia carpeta (rutas que empiezan con ./) y, en las pruebas, vitest.
    files: ['src/guios-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./|vitest$)',
              message: 'guios-core solo puede importar módulos de src/guios-core/ (BRIEF §8.2).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
