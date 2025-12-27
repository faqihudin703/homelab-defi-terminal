// state.js
import fs from "fs"
import { statePath, maxProcessed } from "./config.js"

export function loadState(defaults) {
    if (!fs.existsSync(statePath)) return defaults

    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"))

        // Safety: ensure array exists
        if (!Array.isArray(parsed.processedIds)) parsed.processedIds = []

        // ERC20 block pointers
        if (!parsed.blocks || typeof parsed.blocks !== "object") {
            parsed.blocks = defaults.blocks || {}
        }

        // NFT block pointers (NEW)
        if (!parsed.blocks_nft || typeof parsed.blocks_nft !== "object") {
            parsed.blocks_nft = defaults.blocks_nft || {}
        }

        // Sepolia NFT block pointer
        if (typeof parsed.sepoliaNftBlock !== "number") {
            parsed.sepoliaNftBlock = defaults.sepoliaNftBlock || 0
        }

        return parsed
    } catch (e) {
        console.log("⚠ Failed load state:", e.message)
        return defaults
    }
}


export function createStateManager(stateRef) {
    let dirty = false

    const markDirty = () => { dirty = true }

    const flush = () => {
        if (!dirty) return
        fs.writeFileSync(statePath, JSON.stringify(stateRef.value, null, 2))
        console.log("💾 State flushed.")
        dirty = false
    }

    const pushProcessed = (id) => {
        const arr = stateRef.value.processedIds
        arr.push(id)
        if (arr.length > maxProcessed) arr.shift()
        markDirty()
    }

    const isDirty = () => dirty

    return { markDirty, flush, pushProcessed, isDirty }
}
