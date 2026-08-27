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
ignored by Git. The React app serves this artifact and reverses the gzip stream
in the browser when **Load packed catalog** is selected.
