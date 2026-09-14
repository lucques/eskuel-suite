# Tests

## Terminology

- Test categories:
    - **Unit tests** are colocated with source modules under `src/`. They run in Node and use pure values or injected fakes, not fixture files.
    - **Component tests** live in `tests/component/`. They render React components in Chromium and assert visible behavior through accessible roles and names.
    - **Integration tests** live under `tests/integration/`: Node-compatible subsystem tests are in `tests/integration/node/`, while tests requiring browser APIs are in `tests/integration/webbrowser/`. The database and XML parser projects run shared contracts through their respective adapters.
    - **End-to-end (E2E) tests** live in `tests/e2e/`. They exercise a few critical paths through the complete application served by Vite.
- **Fixtures** under `tests/e2e/fixtures/` and `tests/integration/fixtures/` are small, test-owned input files scoped to their respective suites. E2E requests for bundled game and database URLs are fulfilled from E2E fixtures so tests do not depend on production content under `public/res/`. **Integration support helpers** under `tests/integration/support/` provide reusable setup and assertions used only by integration tests.

## File naming

Vitest files use the `*.test.ts` or `*.test.tsx` suffix. Additional words such as `*.integration.test.ts`, `*.component.test.tsx`, and `*.validation.test.ts` make the test category or purpose explicit, while the containing directory and Vitest configuration determine which project runs the file. Playwright end-to-end files use `*.spec.ts`, where `spec` is short for “specification”: the file specifies the expected application behavior. The distinction between `spec` and `test` is a naming convention used here to make Playwright E2E tests easy to distinguish from Vitest tests, not an inherent technical difference between a specification and a test.

## Behavioral focus

Automated tests focus on behavior rather than visual presentation. Component and E2E tests verify user-observable content, state changes, accessibility semantics, and interactions, but do not assert colors, dimensions, positioning, animation details, computed CSS, or other visual styling. Visual appearance is checked manually; screenshots captured on failures are diagnostic evidence rather than visual-regression assertions.

## Runners and commands

Vitest runs the unit, Node integration, browser integration, and component projects. Unit and Node integration tests use Node; browser integration and component tests use Vitest Browser Mode with Playwright providing Chromium. Playwright Test separately runs E2E tests and starts their Vite server.

- `npm test` or `npm run test:unit`: unit tests
- `npm run test:integration`: Node and browser integration tests, including production-game validation
- `npm run test:integration:node`: Node integration tests only
- `npm run test:integration:webbrowser`: web-browser integration tests only
- `npm run test:component`: component tests
- `npm run test:vitest`: all four Vitest projects
- `npm run test:e2e`: E2E tests
- `npm run test:distribution`: packs the release and checks public TypeScript imports, CLI tools, and the npm and ready-to-host browser widgets in a temporary consumer project; requires Chromium, `tar`, and permission to bind a local loopback port
- `npm run test:all`: type checking, linting, all Vitest projects, and E2E tests
- `npm run test:coverage`: unit and integration coverage

Install the pinned Chromium binary once per machine or CI worker with `npm run test:install-browsers`.

All generated reports and failure evidence use stable paths under the gitignored `test-artifacts/` directory. Vitest writes its HTML report, JUnit report, and browser failure screenshots below `test-artifacts/vitest/`; coverage is available at `test-artifacts/coverage/index.html`; Playwright writes its HTML report, JUnit report, traces, and screenshots below `test-artifacts/playwright/`. CI should upload the complete `test-artifacts/` directory even when a test command fails.
