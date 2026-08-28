# Star Wars: Unlimited Deck Builder

A local-first deck-building playground for [Star Wars: Unlimited](https://starwarsunlimited.com/). Browse a locally packed card catalog, generate and store decks in the browser, exchange decks with SWUDB, or optionally use an AI deck assistant to build, transform, and discuss decks in natural language.

The hosted application is available at [swu.wuteri.ch](https://swu.wuteri.ch/).

This is an independent fan project and is not affiliated with or endorsed by Lucasfilm Ltd., Fantasy Flight Games, or SWUDB.

Aspect icon assets are stored locally and sourced from [ForceTable](https://www.forcetable.net/).

## Features

- Loads a gzip-compressed card catalog directly into browser memory.
- Generates one leader, one base, a 50-card draw deck, and a 10-card sideboard.
- Keeps a persistent, renameable deck library in browser local storage.
- Groups duplicate cards into stacks with quantity indicators.
- Displays the deck's cost curve and nominal USD value when pricing is available.
- Shows structural legality results for each supported deck format.
- Flips supported leader cards between their leader and deployed faces.
- Imports and exports the SWUDB JSON deck format.
- Optionally builds, transforms, or discusses decks through a contextual AI chat with browser dictation support.
- Restricts AI access by client IP and applies configurable per-IP rate limits.

Random decks always contain the required card counts but are intentionally unconstrained by aspect or strategy. The format panel evaluates their locally checkable structure after generation; policy-dependent rotation, suspension, card-pool, and multi-deck checks remain indeterminate when the required external data is unavailable.

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
| `npm run catalog:agent` | Build the compact CSV-formatted text catalog used by AI requests. |

Generated catalog data is not committed:

- `data/catalog.json` contains the complete local source catalog.
- `data/agent/catalog.txt` contains the token-efficient, CSV-formatted AI catalog. The `.txt` extension is intentional: OpenAI spreadsheet input processing limits CSV files to the first 1,000 rows, while plain-text input makes the complete catalog available.
- `public/catalog.json.gz` is copied into the browser production build by Vite.

`catalog:sync-all` checkpoints after each successful set and reports malformed, empty, or failed set payloads without abandoning the remaining downloads.

## Deck workflows

### Random decks

**Random Deck** replaces the one reserved random-deck slot. Renaming that slot realizes it as a normal saved deck, so the next random generation creates a fresh random slot without overwriting the renamed deck. Generated cards are saved immediately in the browser deck library.

### SWUDB interchange

**Import deck** accepts plain SWUDB JSON or a fenced `json` code block. Imports resolve exact catalog IDs before replacing the current deck and preserve supported metadata, second leaders, and sideboards.

**Copy SWUDB JSON** writes the current deck definition to the clipboard for import at [SWUDB](https://swudb.com/decks/) or another compatible tool.

Format-neutral import and export accept structurally valid draw decks from 30 cards upward with no maximum. The AI assistant may edit a deck below that threshold as an incomplete work in progress, but **Copy SWUDB JSON** remains unavailable until the draw deck has at least 30 cards. Format legality applies its own card-count, leader, sideboard, and copy-limit profile independently of interchange validation.

The right-side format panel evaluates the rules available locally for Premier, Eternal, Trilogy, Sealed, Draft, and Twin Suns. It reports structural failures separately from unavailable rotation, suspension, Limited-pool, and Trilogy-package data, so a structural pass is not presented as a complete tournament-legality ruling.

### Browser persistence

Decks and the active selection are stored in local storage. Importing or generating a deck creates a persistent entry, while an accepted AI modification updates its target entry in place. Deck names are unique without regard to capitalization, and deleting the final deck immediately creates a fresh random deck so there is always an active selection.

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

The bottom-left deck assistant receives the current deck and classifies each message as one of three operations: build a new deck, modify the selected deck, or answer a question about it. It is instructed to decline requests outside Star Wars: Unlimited deck building and the selected deck. New-build operations create a Premier-shaped starting deck with exactly one leader, one base, 50 draw-deck cards, and a 10-card sideboard. Modifications are returned as compact `add`, `replace`, and `remove` deltas rather than a repeated full deck. Each delta is rendered with CDN card artwork in one inline list—green for additions, yellow for replacements, and red for removals—and can be applied individually or as a group. The optional `secondLeader` singleton is editable through those same deltas, allowing a selected deck to be converted toward Twin Suns or back to a single-leader format while enforcing a maximum of two leaders total. Modifications remain format-neutral work-in-progress edits: users may empty or overfill either editable card zone without the server silently repairing legality, while a valid primary leader and base remain required. Build and modification results are proposals; the browser changes no deck until the user explicitly applies one.

The browser creates an opaque AI session token when the feature becomes available and keeps the token and visible transcript in local storage. The server binds the session to the client IP, keeps the OpenAI response continuation ID only in memory, and renews a sliding 10-minute TTL after each interaction. Configure the lifetime and capacity with `AGENT_SESSION_TTL_MS` and `AGENT_MAX_SESSIONS`. Expired sessions are replaced automatically.

The compact CSV-formatted text catalog is attached on the first message of a chat and omitted from continuation messages. Its OpenAI file ID and input-format version are cached under `data/agent/` and reused until the catalog changes. `OPENAI_CATALOG_FILE_ID` can point at an existing `.txt` upload when `OPENAI_CATALOG_FILE_FORMAT=plain-text-csv-v1` is also set. Chat responses are stored by the Responses API so `previous_response_id` can preserve context; the current deck and system instructions are still sent on every turn. `OPENAI_STORE_RESPONSES` continues to control the legacy one-shot AI endpoints.

AI controls are visible only when `/api/features` confirms that the requesting IP is allowed. Remote requests share an in-memory per-IP limiter configured with the `AGENT_RATE_LIMIT_*` variables in `.env.example`; direct IPv4 and IPv6 loopback requests bypass that limiter for local development. An explicitly empty access allowlist denies all AI access; when the variable is absent, local loopback access is allowed for development.

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

The production server uses `dist/`, the raw catalog, and the compact agent catalog. Generate all three manually with:

```powershell
npm run catalog:pack
npm run catalog:agent
npm run build
```

`npm run service:package` performs these generation steps and runs the test suite automatically before assembling a release, so they do not need to be run separately for a normal deployment.

## Linux service deployment

Create a versioned service archive and SHA-256 sidecar on Windows:

```powershell
npm run service:package
```

Artifacts are written under the ignored `artifacts/service/` directory. Packages contain the production site, Node server, dependency lockfile, source catalog, compact agent catalog, and a commit-derived manifest. They exclude `.env`, API credentials, private endpoints, the cached OpenAI file ID, and the deployment helpers.

After completing the initial server bootstrap with the scripts under `ops/deploy/`, run a full package, upload, preflight, deployment, and health check with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com
```

Host-key checking is strict by default. On the first connection to a newly provisioned host, verify its ED25519 fingerprint through an independent channel and then add `-AcceptNewHostKey`. That option accepts only a previously unseen key; later key changes still fail.

The deployment account uses a forced SSH command and supports only upload, preflight, deploy, status, and rollback operations. Releases run as a separate locked service account, with the previous healthy release retained as the rollback target. The generated systemd unit keeps inbound application traffic bound to loopback while explicitly permitting the outbound HTTPS connections required by optional AI generation.

### Updating the server bootstrap

Application bundles intentionally do not overwrite the root-owned deployment hook, dispatcher, installer, systemd unit template, or nginx route template. The bootstrap is therefore not permanently one-time: refresh it whenever files under `ops/deploy/` change or a release changes the package layout or generated service configuration.

Transfer the three current scripts to a temporary directory on the server through an independently authorized administrative channel. From that directory, install them as root:

```bash
sudo install -o root -g root -m 0755 install-swu-deck-builder.sh \
  /usr/local/sbin/install-swu-deck-builder
sudo install -o root -g root -m 0755 swu-deck-builder-deploy-root \
  /usr/local/sbin/swu-deck-builder-deploy-root
sudo install -o root -g root -m 0755 swu-deck-builder-ssh-hook \
  /usr/local/sbin/swu-deck-builder-ssh-hook
```

Do not transfer these files through the restricted deployment key: that key is intentionally limited to release uploads and the forced deployment commands. Replacing the scripts at their existing paths preserves the authorized-key command and sudo policy established during the original secure bootstrap.

Servers bootstrapped before the agent catalog moved from `data/agent/catalog.csv` to `data/agent/catalog.txt` must be refreshed before deploying current bundles. An outdated preflight fails with `data/agent/catalog.csv is missing`. Do not add a duplicate `.csv` file to the bundle as a workaround: the current installer validates `catalog.txt` and generates the service setting below so OpenAI receives the complete catalog as plain text:

```ini
SWU_AGENT_CATALOG_PATH=/opt/swu-deck-builder/current/data/agent/catalog.txt
```

After refreshing the bootstrap, rerun the normal deployment command. A bundle that is still present in the remote inbox and has not changed locally can be reused with `-SkipPackage`, `-SkipUpload`, and `-Bundle`; repackaging and re-uploading are unnecessary:

```powershell
$bundle = Get-ChildItem ./artifacts/service/swu-deck-builder-*.zip |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com `
  -SkipPackage `
  -SkipUpload `
  -Bundle $bundle.FullName
```
