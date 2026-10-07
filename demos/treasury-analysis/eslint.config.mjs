export default [
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**"] },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-constant-condition": "error",
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
