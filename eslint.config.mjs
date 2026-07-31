export default [
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        fetch: "readonly",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "multi-line"],
      quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      semi: ["error", "always"],
      "comma-dangle": ["error", "always-multiline"],
      "object-shorthand": "error",
      "no-console": "off",
    },
  },
  {
    files: ["examples/demo-app.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        Blob: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/", "examples/generated/", "docs/"],
  },
];
