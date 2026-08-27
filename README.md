# Star Wars Unlimited Deck Builder

This project is going to be a Star Wars Unlimited deck builder tool.

## Development

Install dependencies and start the local development server:

```sh
npm install
npm run dev
```

## Local card catalog

The catalog commands and development proxy require these values in a local
`.env` file:

```text
SWU_DB_API_BASE_URL=<card API base URL>
SWU_DB_SETS_PAGE_URL=<remote set index URL>
```

The exact endpoint values are intentionally excluded from version control.

Download only the sets needed for local development by passing their set codes:

```sh
npm run catalog:sync -- SOR SHD
```

Download every remotely advertised set that is not already in the local
catalog:

```sh
npm run catalog:sync-all
```

The sync-all command checks the remote set index first, skips local sets, and
checkpoints `catalog.json` after every successful download. Empty, malformed,
or failed set responses are reported and skipped so the remaining sets can
continue syncing.

Already downloaded sets are skipped. Use `--refresh` to update selected sets,
or list the local catalog index without making a network request:

```sh
npm run catalog:refresh -- SOR
npm run catalog:list
```

The generated catalog is stored at `data/catalog.json`. The `data` directory is
ignored by Git.

List every unique set code currently advertised by SWU-DB without downloading
any card data:

```sh
npm run catalog:available
```

Create a gzip-compressed copy for transfer without changing the source catalog:

```sh
npm run catalog:pack
```

The packed database is written to `data/packed/catalog.json.gz` and is also
ignored by Git. The React app loads this artifact automatically and reverses
the gzip stream in the browser.

## Random deck generation

The **Random Deck** action creates one leader, one base, a 50-card draw deck,
and a separate 10-card sideboard. Random sideboard cards are distinct from the
draw-deck selections so they can be swapped in without immediately exceeding a
normal three-copy limit.

## Optional OpenAI deck generation and transformation

The app can generate a Premier deck with a 10-card sideboard from a
natural-language request or ask the model to transform the Premier deck and
sideboard currently on screen. This feature is disabled by default and runs
through the local Node server so the API key is never included in the browser
bundle.

Copy the agent settings from `.env.example` into your untracked `.env` file,
then configure at least:

```text
AGENTIC_DECK_GENERATION_ENABLED=true
SWU_OPENAI_API_KEY=<your OpenAI API key>
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
```

Start both the API and Vite development servers with:

```sh
npm run dev
```

When enabled, **Build with AI** and **Transform with AI** actions appear in the
deck tray. Transform requests send the current deck's canonical SWUDB IDs and
the user's requested changes to the model. The returned full replacement deck
is validated against the local catalog, then shown as an added/removed-card
preview. The current deck remains untouched until **Apply transformation** is
selected; the applied change can be undone once from the tray notice.

Both AI prompt dialogs include an optional **Dictate** control when the browser
supports speech recognition. Dictated text is appended to the prompt, and
recording stops when the user selects **Stop**, submits, or closes the dialog.

On the first request, the server creates a compact JSON representation of the
local card catalog, uploads it as an OpenAI file, and caches the file ID under
the ignored `data/agent` directory. Later generation and transformation
requests reuse that upload until the local catalog changes. Generate the
compact artifact without making an API request with:

```sh
npm run catalog:agent
```

The model must return a strict structured response containing catalog IDs. The
server then verifies every ID, card type, copy limit, the exact 10-card
sideboard, and the 50-card draw-deck count before sending hydrated card data to
the browser. AI transformation currently supports Premier decks only, so
imported decks with a second leader must be changed manually.

This endpoint is intended for local use. Add authentication and durable rate
limiting before exposing it on a public deployment, since each successful
request can incur OpenAI API usage.

## SWUDB import and export

Use **Copy SWUDB JSON** to copy the current deck definition. Use the paired
**Import deck** action to paste either plain JSON or a fenced `json` code block
from this tool or SWUDB.

Imports are resolved entirely in the browser against the loaded local catalog.
The current deck is replaced only after every card ID and card type resolves,
the draw deck contains exactly 50 cards, and the sideboard contains no more
than 10. Deck name and author metadata, optional second leaders, and sideboards
are preserved when the deck is copied again.
