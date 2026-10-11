# Scr

Scr is a private, single-user writing workspace inspired by Scrivener. It provides multiple projects, a hierarchical binder, rich-text documents, notes, manual snapshots, PDF/RTF/Markdown compilation, and a fullscreen typewriter mode.

## Run with Docker

```sh
docker compose up --build -d --wait
```

Open `http://localhost:3000`. Set `SCR_PORT` to change the host port. All application data lives in the named `scr-data` volume; the image makes no runtime network requests and bundles Chromium, Pandoc, and its UI fonts.

Scr has no authentication. Bind it only to a trusted private network or put it behind authentication in a reverse proxy. Do not expose it directly to the public internet.

## Back up and restore

Create a transactionally consistent online SQLite backup while Scr is running:

```sh
./scripts/backup.sh ./scr-backup.sqlite
```

For an offline backup, stop the service and copy the named volume. To restore, stop Scr, replace `/data/scr.sqlite` in the volume with the backup, ensure it is owned by the container's `scr` user, and start the service. Keep a copy of the old database until the restored instance passes `/api/health` and opens the expected projects.

## Local development

Requires Node 24 and npm.

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

The API listens on `HOST`/`PORT`, stores data under `DATA_DIR`, and serves the built SPA from `STATIC_ROOT`.
