# Star Wars: Unlimited Deck Builder

A local-first deck-building playground for [Star Wars: Unlimited](https://starwarsunlimited.com/). Browse a locally packed card catalog, generate and store decks in the browser, exchange decks with SWUDB, or optionally use OpenAI to build and transform decks from natural-language instructions.

The hosted application is available at [swu.wuteri.ch](https://swu.wuteri.ch/).

This is an independent fan project and is not affiliated with or endorsed by Lucasfilm Ltd., Fantasy Flight Games, or SWUDB.

## Features

- Loads a gzip-compressed card catalog directly into browser memory.
- Generates one leader, one base, a 50-card draw deck, and a 10-card sideboard.
- Keeps a persistent, renameable deck library in browser local storage.
- Groups duplicate cards into stacks with quantity indicators.
- Displays the deck's cost curve and nominal USD value when pricing is available.
- Flips supported leader cards between their leader and deployed faces.
- Imports and exports the SWUDB JSON deck format.
- Optionally builds or transforms decks with OpenAI, including browser dictation support.
- Restricts AI access by client IP and applies configurable per-IP rate limits.

Random decks are structurally complete but intentionally unconstrained; aspect, format, and strategic validation are still future work.

## Requirements

- Node.js 22 or newer
- npm
- A local `.env` containing the private catalog-source configuration

## Local setup

Install dependencies and create the local configuration file:

```powershell
npm install
Copy-Item .env.example .env
```

Set the real catalog endpoints in `.env`:

```text
SWU_DB_API_BASE_URL=<card API base URL>
SWU_DB_SETS_PAGE_URL=<remote set index URL>
```

The endpoint values are intentionally excluded from version control. Populate and pack the catalog, then start the React and API development servers:

```powershell
npm run catalog:sync-all
npm run catalog:pack
npm run dev
```

Vite serves the site at `http://127.0.0.1:5173` and proxies application API requests to the local Express server on port `8787` by default.

## Catalog commands

| Command | Purpose |
| --- | --- |
| `npm run catalog:available` | List every set advertised by the configured remote source. |
| `npm run catalog:list` | List sets already present in the local catalog. |
| `npm run catalog:sync -- SOR SHD` | Download selected sets that are not already local. |
| `npm run catalog:sync-all` | Download every advertised set missing locally, skipping failed payloads. |
| `npm run catalog:refresh -- SOR` | Replace selected local sets with fresh remote data. |
| `npm run catalog:pack` | Compress the browser catalog with maximum gzip compression. |
| `npm run catalog:agent` | Build the compact CSV catalog used by AI requests. |

Generated catalog data is not committed:

- `data/catalog.json` contains the complete local source catalog.
- `data/agent/catalog.csv` contains the token-efficient AI catalog.
- `public/catalog.json.gz` is copied into the browser production build by Vite.

`catalog:sync-all` checkpoints after each successful set and reports malformed, empty, or failed set payloads without abandoning the remaining downloads.

## Deck workflows

### Random decks

**Random Deck** replaces the one reserved random-deck slot while preserving a custom name assigned to that slot. The generated cards are saved immediately in the browser deck library.

### SWUDB interchange

**Import deck** accepts plain SWUDB JSON or a fenced `json` code block. Imports resolve exact catalog IDs before replacing the current deck and preserve supported metadata, second leaders, and sideboards.

**Copy SWUDB JSON** writes the current deck definition to the clipboard for import at [SWUDB](https://swudb.com/decks/) or another compatible tool.

### Browser persistence

Decks and the active selection are stored in local storage. Importing or generating a deck creates a persistent entry, while **Transform with AI** updates the selected entry in place. Deck names are unique without regard to capitalization.

Browser storage is local to the current browser profile and is not synchronized to a server.

## Optional OpenAI assistance

AI assistance is disabled by default. It runs through the Node server so the OpenAI API key is never placed in the browser bundle or returned by the feature-discovery endpoint.

Configure the following values in the untracked `.env`:

```text
AGENTIC_DECK_GENERATION_ENABLED=true
SWU_OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
AGENT_ACCESS_ALLOWED_IPS=127.0.0.1,::1
```

**Build with AI** sends the user's prompt and the compact card catalog. **Transform with AI** also sends the current deck IDs and requested changes. Responses use a strict structured schema, and the server verifies exact IDs, card types, copy limits, draw-deck size, and sideboard size before returning hydrated card data.

The compact CSV catalog is uploaded on the first request. Its OpenAI file ID is cached under `data/agent/` and reused until the catalog changes. `OPENAI_CATALOG_FILE_ID` can point at an existing upload instead.

AI controls are visible only when `/api/features` confirms that the requesting IP is allowed. Requests share an in-memory per-IP limiter configured with the `AGENT_RATE_LIMIT_*` variables in `.env.example`. An explicitly empty access allowlist denies all AI access; when the variable is absent, local loopback access is allowed for development.

## Project layout

```text
public/       Browser assets and the ignored packed catalog
data/         Ignored source and AI catalog data
src/          React application and browser-side deck logic
server/       Express API and OpenAI integration
scripts/      Catalog, packaging, and deployment commands
ops/deploy/   Restricted Linux deployment helpers
test/         Node test suite
docs/         Local specifications and rules references
```

## Build and test

```powershell
npm test
npm run build
```

The production server uses `dist/`, the raw catalog, and the compact agent catalog. Generate all three with:

```powershell
npm run catalog:pack
npm run catalog:agent
npm run build
```

## Linux service deployment

Create a versioned service archive and SHA-256 sidecar on Windows:

```powershell
npm run service:package
```

Artifacts are written under the ignored `artifacts/service/` directory. Packages contain the production site, Node server, dependency lockfile, source catalog, compact agent catalog, and a commit-derived manifest. They exclude `.env`, API credentials, private endpoints, the cached OpenAI file ID, and the deployment helpers.

After completing the one-time server bootstrap with the scripts under `ops/deploy/`, run a full package, upload, preflight, deployment, and health check with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com
```

The deployment account uses a forced SSH command and supports only upload, preflight, deploy, status, and rollback operations. Releases run as a separate locked service account, with the previous healthy release retained as the rollback target.
