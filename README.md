# Star Wars: Unlimited Deck Builder

A local-first deck builder for [Star Wars: Unlimited](https://starwarsunlimited.com/), with catalog browsing, saved decks, legality checks, SWUDB interchange, pricing, and optional AI assistance.

[Open the hosted app](https://swu.wuteri.ch/) · [Download the desktop app](https://github.com/Alfwich/swu-deck-builder/releases/latest) · [Play exported decks on ForceTable](https://www.forcetable.net/)

> This independent fan project is not affiliated with or endorsed by Lucasfilm Ltd., Fantasy Flight Games, or SWUDB.

## Highlights

- Browse a compressed card catalog with search, filters, prices, and card art.
- Build and save decks locally with cost curves and format-aware legality checks.
- Start blank decks, choose or replace their identities, and manage sideboards.
- Import and export SWUDB-compatible JSON.
- Use an AI Deck Assistant backed by OpenAI, Codex CLI, or Claude CLI.
- Use browser dictation and optional CLI-powered web search.

## Quick start

Requires Node.js 22+ and npm.

Install dependencies. The install hook creates `.env` with basic defaults when
needed, preferring Codex and then Claude when either CLI is installed:

```powershell
npm install
```

Start the development servers:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. If no usable local catalog exists, startup downloads and caches the public catalog automatically. Vite proxies API requests to the local Express server on port `8787` by default.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the React and API development servers |
| `npm run env:configure` | Add missing `.env` defaults and detect a local AI CLI |
| `npm test` | Run the test suite |
| `npm run build` | Create a production build |
| `npm run desktop:start` | Build and launch the Electron application |
| `npm run desktop:package` | Create an unpacked desktop application |
| `npm run desktop:make` | Create native desktop distributables for the current platform under `out/` |
| `npm run catalog` | Refresh and cache the public catalog |
| `npm run catalog:available` | List sets advertised by the remote source |
| `npm run catalog:list` | List locally available sets |
| `npm run catalog:sync -- SOR SHD` | Download selected missing sets |
| `npm run catalog:sync-all` | Download every missing set |
| `npm run catalog:refresh -- SOR` | Conditionally refresh selected sets when their content changes |
| `npm run catalog:refresh-all` | Conditionally refresh every remotely advertised set |
| `npm run catalog:pack` | Build the compressed browser catalog |
| `npm run catalog:agent` | Build the compact AI catalog |

## Deck workflows

### New decks

**New Deck** creates an empty work in progress. Choose a primary leader and base from catalog search, then add draw-deck and sideboard cards. Once selected, the primary leader and base can be replaced but not removed. An optional second leader remains removable for Twin Suns construction.

### SWUDB interchange

- **Import deck** accepts SWUDB JSON directly or inside a fenced `json` block.
- **Copy SWUDB JSON** copies compatible deck data for [SWUDB](https://swudb.com/decks/) and similar tools.
- Import/export accepts draw decks of 30 cards or more. The AI may edit smaller works in progress, but export stays disabled until the deck reaches 30 cards.
- Premier, Eternal, Trilogy, Sealed, Draft, and Twin Suns checks separate structural errors from policy data the app cannot verify locally.

### Deck persistence

Local development uses an authoritative SQLite deck library by default. The
generated `.env` contains:

```text
LOCAL_DECK_DATABASE_PATH=data/local/decks.sqlite
```

The ignored database file lives inside the working repository and survives
browser-storage clearing. A new database imports the current browser deck
library once; subsequent loads and writes use the database as the source of
truth. The active deck selection remains a browser-local preference. Revision
checks reject stale writes from another tab instead of overwriting newer deck
data.

Remove or leave `LOCAL_DECK_DATABASE_PATH` empty to exercise browser-only
persistence. In that mode, decks, the active selection, and recent work stay in
the current browser profile. Database mode also requires the Node server to bind
to loopback. Web production hard-disables it, and the service bundle excludes
SQLite files, so the deployed application continues to use browser storage
exclusively. The packaged Electron runtime is the one production exception: it
binds only to loopback and stores its database in Electron's per-user
application-data directory.

Creating, importing, or accepting an AI-built deck creates a saved entry, while
accepted AI changes update their target deck in place.

## Catalog data

Generated catalog files are ignored by Git:

| File | Purpose |
| --- | --- |
| `data/catalog.json` | Complete local source catalog |
| `data/cache/public-catalog.json.gz` | Cached public catalog download |
| `data/cache/public-catalog-metadata.json` | Public cache validators and checksum |
| `data/agent/catalog.txt` | Compact CSV-formatted catalog used in AI prompts |
| `public/catalog.json.gz` | Compressed catalog copied into the browser build |

`npm run catalog` conditionally refreshes from `https://swu.wuteri.ch/catalog.json.gz` using `ETag` and `Last-Modified`. Override that URL with `SWU_PUBLIC_CATALOG_URL`. Builds, development, previews, production starts, and service packaging preserve a valid local catalog; they use the public source only when the local catalog is missing or invalid.

To maintain a catalog from a private card source, set `SWU_DB_API_BASE_URL` and `SWU_DB_SETS_PAGE_URL`, then use the `catalog:sync*` and `catalog:pack` commands. Those endpoint values should stay outside version control.

The AI catalog deliberately uses a `.txt` extension so OpenAI processes the full catalog rather than applying its 1,000-row CSV spreadsheet limit. `catalog:sync-all` checkpoints successful sets and continues past malformed or failed payloads.

## AI assistance

Local setup enables AI assistance by default when Codex or Claude is detected. It can build a new deck, propose changes to the selected deck, or answer deck-building questions. Proposed changes are never applied until the user accepts them.

The generated, untracked `.env` selects an installed Codex CLI first and then Claude CLI. With neither installed, AI stays disabled; the OpenAI API is never selected automatically. Linux service installs also keep AI disabled until explicitly configured. Provider credentials and settings stay on the Node server.

CLI requests use the subscription belonging to the account authenticated in the selected tool. Local environment generation and development startup print a warning about that account usage whenever Codex or Claude is enabled.

### OpenAI API

Uses the OpenAI API directly. Web search is not enabled for this provider.

```text
AGENTIC_DECK_GENERATION_ENABLED=true
AGENTIC_DECK_PROVIDER=openai-api
SWU_OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
AGENT_ACCESS_ALLOWED_IPS=127.0.0.1,::1
# Optional for public clients; use only behind HTTPS.
AGENT_ACCESS_PASSWORD=<shared access password>
```

### Codex CLI

Install and authenticate `codex` as the same operating-system user that runs the Node server:

```text
AGENTIC_DECK_GENERATION_ENABLED=true
AGENTIC_DECK_PROVIDER=codex-cli
AGENT_CLI_MODEL=gpt-5.6-sol
AGENT_CLI_REASONING_EFFORT=high
AGENT_CLI_WEB_SEARCH_ENABLED=true
AGENT_CLI_PATH=
AGENT_ACCESS_ALLOWED_IPS=127.0.0.1,::1
```

### Claude CLI

Install and authenticate `claude` as the same operating-system user that runs the Node server:

```text
AGENTIC_DECK_GENERATION_ENABLED=true
AGENTIC_DECK_PROVIDER=claude-cli
AGENT_CLI_MODEL=claude-sonnet-4-6
AGENT_CLI_REASONING_EFFORT=high
AGENT_CLI_WEB_SEARCH_ENABLED=true
AGENT_CLI_PATH=
AGENT_ACCESS_ALLOWED_IPS=127.0.0.1,::1
```

The server auto-detects `codex` first and then `claude` on `PATH` when `AGENTIC_DECK_PROVIDER` is empty. Use `AGENT_CLI_PATH` only with an explicit provider to provide an executable path. Leave the model or reasoning setting empty to use the CLI default.

### CLI options

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_CLI_MODEL` | CLI default | Model name passed to the selected CLI |
| `AGENT_CLI_REASONING_EFFORT` | CLI default | Codex: `minimal`–`xhigh`; Claude: `low`–`max` |
| `AGENT_CLI_WEB_SEARCH_ENABLED` | `false` | Enables Codex search or Claude `WebSearch`/`WebFetch` |
| `AGENT_CLI_PATH` | Auto-detected | Explicit executable path override |
| `AGENT_CLI_TIMEOUT_MS` | `120000` | Maximum runtime per invocation |
| `AGENT_CLI_MAX_OUTPUT_BYTES` | `1048576` | Maximum captured output |
| `AGENT_CLI_MAX_CONCURRENCY` | `1` | Maximum simultaneous CLI processes |
| `AGENT_CLI_WORK_PATH` | `data/agent/cli` | Read-only child-process working directory |
| `AGENT_CLI_STATE_PATH` | Current user state | Optional isolated provider config/auth directory |

CLI integrations write prompts and catalog data to stdin. They invoke the vendor CLI as a bounded, otherwise tool-disabled child process; they normally still use the vendor's hosted model and are not offline inference.

<details>
<summary>AI behavior, sessions, and security</summary>

- Web search applies only to `codex-cli` and `claude-cli`. Results may supplement current policy, releases, strategy, and metagame context, but the bundled catalog remains authoritative for card IDs and metadata. Answers cite URLs when web information matters.
- New builds target one leader, one base, 50 draw-deck cards, and a 10-card sideboard. Modifications arrive as reviewable `add`, `replace`, and `remove` proposals, including optional second-leader changes.
- The current deck is sent on every turn. Renaming or selecting another deck preserves the browser chat session. The first message after an actual deck switch explicitly discards the prior provider continuation and starts fresh with the new deck; otherwise provider-native continuation handles later turns.
- Browser transcripts and opaque session tokens stay in local storage, and server-side continuation IDs stay in memory. Local Codex and Claude CLI sessions do not expire; OpenAI API sessions use the configured sliding TTL. All sessions remain bound to the client IP and are cleared by a server restart or an explicit new chat.
- `/api/features` exposes AI controls only to currently authorized IPs. The unlinked `/enable` route accepts the shared password and grants a fixed 10-minute in-memory lease for the proxy-resolved public IP. Reauthentication replaces it with a fresh lease, and server restarts clear all leases. Use the gate only over HTTPS.
- Remote AI traffic uses the `AGENT_RATE_LIMIT_*` settings, and password attempts have a separate `AGENT_ACCESS_AUTH_RATE_LIMIT_*` limit. Loopback bypasses the AI request limiter for development. An empty allowlist with no access password denies all AI access.
- The OpenAI catalog upload is cached under `data/agent/`. An existing upload can be selected with `OPENAI_CATALOG_FILE_ID` and `OPENAI_CATALOG_FILE_FORMAT=plain-text-csv-v1`.

See [.env.example](./.env.example) for every AI, session, rate-limit, and execution setting.

</details>

## Project layout

```text
public/       Browser assets and the ignored packed catalog
data/         Ignored source and AI catalog data
desktop/      Electron entry point and desktop runtime helpers
src/          React application and browser-side deck logic
server/       Express API and AI provider integrations
scripts/      Catalog, packaging, and deployment commands
ops/deploy/   Restricted Linux deployment helpers
test/         Node test suite
docs/         Local specifications and rules references
```

## Desktop application

The Electron build embeds the existing Express server and opens the compiled
React application in a sandboxed `BrowserWindow`. It does not expose Node.js to
the renderer. The server listens on a random loopback port and requires a new,
high-entropy access cookie on every application launch.

### Install the latest packaged build

Download the installer from the
[latest GitHub release](https://github.com/Alfwich/swu-deck-builder/releases/latest).
The initial desktop release is `v0.1.0`. Choose the asset for your platform:

- **Windows x64:** `SWU Deck Builder-<version> Setup.exe`. The `.nupkg` file
  and `RELEASES` manifest support Squirrel.Windows update tooling.
- **macOS Apple Silicon or Intel:** the universal `.dmg`. A `.zip` is also
  included for archive-based distribution and future update tooling.
- **Linux x64:** `.deb` for Debian/Ubuntu-based systems or `.rpm` for
  Fedora/RHEL-based systems.

The desktop app stores decks on the local computer and can use an existing
Codex or Claude CLI login for its AI assistant. Open **Desktop settings** after
installation to choose or auto-detect a CLI. Provider credentials and CLI state
remain outside the browser interface.

### Run from source

Install dependencies, then launch the desktop build:

```powershell
npm run desktop:start
```

Decks are authoritative in `decks.sqlite` beneath Electron's `userData`
directory, rather than in the installed application or browser storage. Use
**Desktop settings** in the application navigation to enable an auto-detected
Codex or Claude CLI, select a provider explicitly, set an executable path,
model, reasoning effort, and web-search preference, or disable the assistant.
Saving the settings restarts the application so the embedded server can apply
them. These preferences live in `agent-settings.json` beneath Electron's
`userData` directory and are never exposed by the hosted web application.

When the desktop assistant is unavailable, its panel points to Desktop settings
instead of suggesting that the user clone the repository. The hosted web
application retains the repository-clone guidance.

Create an unpacked app or a Squirrel.Windows installer with:

```powershell
npm run desktop:package
npm run desktop:make
```

Desktop output is written beneath the ignored `out/` directory. The installer
formats produced depend on the host operating system. Public Windows and macOS
builds should eventually be code-signed, and macOS builds should be notarized,
to avoid operating-system trust warnings.

Pushing a semantic-version tag such as `v0.3.0` triggers
`.github/workflows/electron-release.yml`. Before publishing anything, the
workflow requires the tag to match the versions in `package.json` and
`package-lock.json`, requires matching release notes beneath `docs/releases/`,
and runs the unit tests and lint checks on the native Windows, macOS, and Linux
runners. Each runner then builds its Electron distributables. Only after every
platform succeeds does the workflow create and publish the GitHub release with
its release notes and assets. A failed validation or build leaves no published
release. The macOS job builds a universal binary; the Windows and Linux jobs
currently target x64.

## Build and deployment

```powershell
npm test
npm run build
```

To prepare every production input manually:

```powershell
npm run catalog:pack
npm run catalog:agent
npm run build
```

`npm run service:package` runs those steps and the tests before assembling a release.

## Linux service deployment

Create a versioned service archive and SHA-256 sidecar on Windows:

```powershell
npm run service:package
```

Artifacts are written to the ignored `artifacts/service/` directory. Secrets, private endpoints, cached provider IDs, and deployment helpers are excluded.

After bootstrapping the server with `ops/deploy/`, package, upload, preflight, deploy, and health-check it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com
```

See [ops/deploy/README.md](./ops/deploy/README.md) for the trust model, bootstrap maintenance, host-key requirements, rollback flow, and legacy catalog migration.

## License and attribution

Released under the [WTFPL, Version 2](https://en.wikipedia.org/wiki/WTFPL). See [LICENSE](./LICENSE). Aspect icons are sourced from [ForceTable](https://www.forcetable.net/).
