import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import unicorn from 'eslint-plugin-unicorn';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
        // Apply unicorn rules but not as 'recommended' - we'll cherry-pick
        plugins: {
            unicorn,
        },
    },
    {
        files: ['**/*.{ts,tsx,vue}'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                // Node/Build globals
                process: 'readonly',
            },
        },
        rules: {
            // Enable select unicorn rules (not all 'recommended')
            'unicorn/better-regex': 'error',
            'unicorn/catch-error-name': 'error',
            'unicorn/no-instanceof-array': 'error',
            'unicorn/prefer-array-find': 'error',
            'unicorn/prefer-includes': 'error',
            'unicorn/prefer-string-starts-ends-with': 'error',
            'unicorn/throw-new-error': 'error',

            // Unicorn rules we're skipping (too strict for this codebase)
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/filename-case': 'off',
            'unicorn/no-null': 'off',
            'unicorn/prefer-top-level-await': 'off',
            'unicorn/prefer-module': 'off',
            'unicorn/consistent-function-scoping': 'off',
            'unicorn/no-useless-undefined': 'off',
            'unicorn/prefer-array-some': 'off', // .find() is fine
            'unicorn/prefer-number-properties': 'off', // isNaN is fine
            'unicorn/no-array-for-each': 'off',
            'unicorn/no-await-expression-member': 'off',

            // TypeScript rules adjustments
            '@typescript-eslint/no-explicit-any': 'off', // Too many to fix right now
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],

            // Vue-specific rules
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'warn',

            // General code quality
            'no-console': 'off', // Allow console for now
            'no-debugger': 'error',
        },
    },
    {
        files: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts', '**/__mocks__/**'],
        rules: {
            // Relax rules for test files
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off', // Function type is okay in mocks
        },
    },
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'coverage/**',
            '**/*.config.ts',
            '**/*.config.js',
            '.husky/**',
        ],
    }
);
