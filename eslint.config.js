// Revisión automática del código: detecta variables inexistentes o mal escritas antes de publicar.
import globals from "globals";
export default [
  { ignores: ["dist/**", "dist-test/**", "dist-mock/**", "node_modules/**", "playwright-report/**", "test-results/**", "netlify/**"] },
  {
    files: ["src/**/*.js", "tests/**/*.js", "test/**/*.js", "public/sw.js", "*.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
    rules: { "no-undef": "error", "no-unused-vars": "off" }
  }
];
