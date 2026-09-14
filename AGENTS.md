# Repository Instructions
- Use 4 spaces for indentation in all source files.

## Build & Run
- Never use `npm run build`.
- Instead, in order to get feedback from the TypeScript compiler, run `npm run typecheck`

## Tests
- **Never write tests about styles.** Do not assert CSS properties, CSS classes, dimensions, positioning, colors, or other visual and layout implementation details.
- Run the narrowest relevant test command first. Do not run `npm run test:all` unless full verification is warranted.
- Run browser-based tests only through the repository's configured test scripts. Do not pass `--headed` or `--ui`.
- The browser-based commands `npm run test:component`, `npm run test:integration`, `npm run test:integration:webbrowser`, `npm run test:vitest`, `npm run test:coverage`, `npm run test:e2e`, and `npm run test:all` start local loopback servers and require permission to bind local ports. In restricted sandbox sessions, request permission to run the exact command outside the sandbox before executing it; do not first attempt a command that is known to fail because local port binding is unavailable, and do not report a sandbox-related bind error as a test failure.
- Never run `npm run dev` unless the user explicitly requests the development server. The command is intentionally configured to open a browser window for interactive human use.
- Do not open browser windows, Playwright UI mode, development-server pages, or HTML reports unless explicitly requested.

## Bootstrap Icons
- When using Bootstrap Icons, prefer the CSS-class form over components from `react-bootstrap-icons`:
    ```tsx
    <i
        className='bi bi-check-circle text-success me-2'
        aria-hidden='true'
    />
    ```

## Typescript
- Use single quotes for strings in all source files.
- Keep case distinctions structurally explicit. Do not use an early return (also known as a guard clause) to avoid an `else` branch; when one `if` branch returns or otherwise terminates control flow, put the alternative case in an explicit `else` or `else if` branch instead of relying on fallthrough.
- Exception for boolean checks: the `else` branch may be omitted when nothing needs to happen if the condition is false. Do not add an empty `else` branch solely to make the case distinction explicit.
- For case distinctions, always make sure that all cases are handled, enforced by the compiler.
    - Example for switch-case:
        ```ts
        switch (f.kind) {
            case "val":
                return ...
            default: { const _n: never = f; return _n; }
        }
        ```
        Make the last line actually a one-liner as shown above.
    - Example for if-else:
        ```ts
        if (layout === "desktop") {
            ...
        }
        else if (layout === "mobile") {
            ...
        }
        else { const _n: never = layout; }
        ```
        Make the last line actually a one-liner as shown above.
