<p align="center">
  <img src="apps/web/src/assets/plumavance-logo.svg" alt="Plumavance logo" width="220">
</p>

# Plumavance

Plumavance is a private, self-hosted writing workspace inspired by Scrivener. It combines multiple projects, a hierarchical binder, rich-text documents, notes, manual snapshots, PDF/RTF/Markdown export, and a fullscreen typewriter mode in a compact three-pane interface.

## Setup with Docker

1. Install Docker Engine or Docker Desktop with Docker Compose support.

2. Open a terminal in the Plumavance repository.

3. Build and start the application.

   ```sh
   docker compose up --build -d --wait
   ```

4. Open Plumavance in your browser.

   ```text
   http://localhost:3000
   ```

5. When you want to stop the application, run:

   ```sh
   docker compose down
   ```

Your projects are stored in the Docker volume named `pluma_pluma-data`. Running `docker compose down` does not delete this volume. Do not run `docker compose down --volumes` unless you intend to delete the stored application data.

Upgrading an existing installation requires a one-time data move because the Compose service, volume, and database file have new identifiers. Before replacing the previous checkout, create a SQLite backup with that version's backup script and stop its stack. Restore the backup as `/data/pluma.sqlite` in the new `pluma_pluma-data` volume before using Plumavance; otherwise the renamed stack starts with an empty database.

To use a different host port, set `PLUMA_PORT` when starting the application:

```sh
PLUMA_PORT=8080 docker compose up --build -d --wait
```

Then open `http://localhost:8080`.

Plumavance has no accounts, login screen, or application-level authentication. Run it only on a trusted private network, or place it behind an authenticated reverse proxy. Do not expose it directly to the public internet.

## Back up your data

1. Keep Plumavance running.

2. Run the backup script with the desired output filename.

   ```sh
   ./scripts/backup.sh ./pluma-backup.sqlite
   ```

3. Store the resulting SQLite file somewhere separate from the Docker host.

To restore a backup, stop Plumavance, replace `/data/pluma.sqlite` in the `pluma_pluma-data` volume with the backup, ensure the file is owned by the container's `pluma` user, and start the application again. Keep the previous database until the restored application passes `/api/health` and the expected projects open correctly.

## Local development

Local development requires Node.js 24 and npm.

1. Install the locked dependencies.

   ```sh
   npm ci
   ```

2. Run linting.

   ```sh
   npm run lint
   ```

3. Run type checks.

   ```sh
   npm run typecheck
   ```

4. Run the unit tests.

   ```sh
   npm test
   ```

5. Build the application.

   ```sh
   npm run build
   ```

6. Run the browser tests.

   ```sh
   npm run test:e2e
   ```

The API reads `HOST`, `PORT`, `DATA_DIR`, and `STATIC_ROOT` from the environment. The normal browser suite uses a temporary local database and skips Docker-only checks.

On a Docker-capable host, run the container replacement, persistence, and real export-converter test with:

```sh
RUN_CONTAINER_E2E=1 npm run test:e2e -- e2e/container-persistence.spec.ts
```
