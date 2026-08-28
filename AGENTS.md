# AGENTS.md

These instructions apply to the entire repository.

## Project stack

- Use modern JavaScript and JSX with native ES modules; do not introduce TypeScript unless requested.
- The browser application uses React 19 and Vite. The API uses Node.js and Express.
- Keep the application local-first. Decks and browser chat state belong in browser storage unless a task explicitly changes that architecture.

## React and web development

- Prefer small, focused components and pure helper functions over adding more responsibility to large components.
- Reuse existing deck, catalog, persistence, and validation helpers instead of duplicating their logic in components.
- Treat React state as immutable. Use functional state updates when the next value depends on the current value.
- Keep effects for synchronization with external systems. Derive display values during rendering or with `useMemo` when appropriate.
- Preserve stable deck and card identifiers across edits, renames, imports, and AI proposals.
- Use semantic HTML and accessible controls. Interactive elements must work with a keyboard and have an accessible name.
- Follow the existing responsive layout and CSS conventions. Avoid inline styles when a reusable class is appropriate.
- Provide explicit loading, empty, error, and disabled states for asynchronous UI.
- Never expose server environment variables, provider credentials, CLI state, or API keys to browser code.

## Catalog and generated files

- Do not hand-edit generated catalog artifacts under `data/` or `public/catalog.json.gz`.
- Use the existing `catalog:*` npm commands to sync, refresh, pack, or build agent catalog data.
- Preserve exact catalog card IDs; do not normalize or invent identifiers in UI or AI workflows.

## Tests and validation

- Add or update focused `node:test` coverage for behavior changes.
- Run these commands before handing off a change:

  ```powershell
  npm test
  npm run lint
  npm run build
  ```

- Keep unrelated user changes intact and do not commit generated build output.
