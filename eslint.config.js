const { defineConfig } = require("eslint/config")

const typescriptEslint = require("@typescript-eslint/eslint-plugin")
const globals = require("globals")
const tsParser = require("@typescript-eslint/parser")
const js = require("@eslint/js")

const { FlatCompat } = require("@eslint/eslintrc")

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

module.exports = defineConfig([{
  extends: compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
  ),

  plugins: {
    "@typescript-eslint": typescriptEslint,
  },

  languageOptions: {
    globals: {
      ...globals.node,
    },

    parser: tsParser,
    sourceType: "module",

    parserOptions: {
      project: "./tsconfig.json",
    },
  },

  rules: {
    semi: ["error", "never"],

    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/no-explicit-any": "off",

    "@typescript-eslint/no-unused-vars": ["error", {
      "varsIgnorePattern": "^_",
      "argsIgnorePattern": "^_",
      "caughtErrorsIgnorePattern": "^_",
      "destructuredArrayIgnorePattern": "^_",
    }],

    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-types": "off",
  },
}])
