import { ensureDataDirectory, loadConfig } from './config.js'
import { createApp } from './app.js'

const config = loadConfig()
await ensureDataDirectory(config.dataDirectory)
const app = await createApp({ databasePath: config.databasePath, staticRoot: config.staticRoot })

const shutdown = async (): Promise<void> => {
  await app.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: config.host, port: config.port })
