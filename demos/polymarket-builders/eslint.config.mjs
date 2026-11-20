export default [
  {
    ignores: ["node_modules/**", "test-results/**", "playwright-report/**"],
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
