// index.js
import { Relayer } from './relayer.js'

const r = new Relayer()
r.start()

const shutdown = () => {
    console.log("⚠ Shutdown triggered — flushing state before exit...")
    try { r.flush?.() } catch {}
    process.exit(0)
}

// POSIX signals
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

// Exit hooks
process.on("beforeExit", shutdown)
process.on("exit", shutdown)