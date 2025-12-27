// relayer.js
import { chains, flushIntervalMs } from "./config.js"
import { initProviders } from "./providers.js"
import { loadState, createStateManager } from "./state.js"
import { setupWssListeners } from "./events.js"
import {
    pollSepolia,
    pollHoodi,
    pollBase,
    pollOptimism,
    pollArbitrum,

    // NFT pollers
    pollSepoliaNFT,
    pollHoodiNFT,
    pollBaseNFT,
    pollOptimismNFT,
    pollArbitrumNFT
} from "./poller.js"

export class Relayer {
    async start() {
        console.log("🔄 Starting Modular Hybrid Relayer with NFT support...")

        // include NFTVault + WrappedNFT providers
        const {
            readSepolia,
            vaultRead,
            vaultWrite,
            vaultWss,

            nftVaultRead,
            nftVaultWrite,
            nftVaultWss
        } = await initProviders()

        // -------------------------
        // INIT BLOCK SYNC
        // -------------------------
        const headSepolia = await readSepolia.getBlockNumber()
        const defaults = {
            sepoliaBlock: headSepolia - 1,
            sepoliaNftBlock: headSepolia - 1,
            blocks: {},
            blocks_nft: {},
            processedIds: []
        }

        for (const [key, c] of Object.entries(chains)) {
            // ERC20 block
            if (c.readProvider) {
                try {
                    const head = await c.readProvider.getBlockNumber()
                    defaults.blocks[key] = head - 1
                    defaults.blocks_nft[key] = head - 1
                } catch {
                    defaults.blocks[key] = 0
                    defaults.blocks_nft[key] = 0
                }
            } else {
                defaults.blocks[key] = 0
                defaults.blocks_nft[key] = 0
            }
        }

        // -------------------------
        // LOAD STATE
        // -------------------------
        const state = { value: loadState(defaults) }
        const { markDirty, flush, pushProcessed, isDirty } = createStateManager(state)

        console.log("📁 Restored State:", state.value)

        // ==========================================================
        // ERC20 PROCESSORS
        // ==========================================================
        const processLock = async (ev) => {
            const [user, destAddr, recipient, amount, nonce, destChainId, tid] = ev.args
            const id = tid.toString()

            if (state.value.processedIds.includes(id)) return

            const chain = Object.values(chains).find(c => c.chainId === destChainId.toString())
            if (!chain) return console.log("⚠ Unknown dest chain:", destChainId)
            if (!chain.wTokenWrite) return console.log(`⚠ No wTokenWrite for ${chain.name}`)

            try {
                const tx = await chain.wTokenWrite.mintWrapped(recipient, amount, id)
                console.log(`🎉 [ERC20] Mint on ${chain.name}: ${tx.hash}`)
                pushProcessed(id)
            } catch (e) {
                console.log(`❌ [ERC20] Mint error on ${chain.name}:`, e.message)
            }
        }

        const processBurn = async (user, amount, tid, chainKey) => {
            const id = tid.toString()
            if (state.value.processedIds.includes(id)) return

            const c = chains[chainKey]
            if (!c) return

            try {
                const tx = await vaultWrite.releaseV2(user, amount, c.chainId, id)
                console.log(`🎉 [ERC20] Release from ${c.name}: ${tx.hash}`)
                pushProcessed(id)
            } catch (e) {
                console.log(`❌ [ERC20] Release error:`, e.message)
            }
        }

        // ==========================================================
        // NFT PROCESSORS  (NEW)
        // ==========================================================
        const processNftLock = async (ev) => {
            const [
                transferId,
                nftAddress,
                tokenId,
                sender,
                recipient,
                destChainId,
                uri,
                name,
                symbol
            ] = ev.args

            const id = transferId.toString()
            if (state.value.processedIds.includes(id)) return

            const chain = Object.values(chains).find(c => c.chainId === destChainId.toString())
            if (!chain) {
                console.log("⚠ Unknown NFT dest chain:", destChainId)
                return
            }
            if (!chain.wNftWrite) {
                console.log(`⚠ No wNFT write provider for ${chain.name}`)
                return
            }

            try {
                const tx = await chain.wNftWrite.mintWrapped(recipient, tokenId, uri, id)
                console.log(`🎉 [NFT] Mint NFT on ${chain.name}: ${tx.hash}`)
                pushProcessed(id)
            } catch (err) {
                console.log(`❌ [NFT] Mint error on ${chain.name}:`, err.message)
            }
        }

        const processNftBurn = async (
            user,
            tokenId,
            transferId,
            chainKey,
            originalCollectionAddress,
            uri
        ) => {
            const id = transferId.toString()
            if (state.value.processedIds.includes(id)) return

            if (!nftVaultWrite) {
                console.log("❌ NFTVault write provider is missing")
                return
            }

            try {
                const tx = await nftVaultWrite.releaseNFT(
                    originalCollectionAddress,
                    tokenId,
                    user,
                    id
                )
                console.log(`🎉 [NFT] Release back to L1: ${tx.hash}`)
                pushProcessed(id)
            } catch (e) {
                console.log("❌ [NFT] Release error:", e.message)
            }
        }

        // ==========================================================
        // WSS LISTENERS (ERC20 + NFT)
        // ==========================================================
        setupWssListeners(
            vaultWss,
            nftVaultWss,
            {
                onLock: processLock,
                onBurn: processBurn,
                onNftLock: processNftLock,
                onNftBurn: processNftBurn
            }
        )

        // ==========================================================
        // POLLING LOOPS (ERC20)
        // ==========================================================
        const loopSepolia = async () => {
            const delay = await pollSepolia(state, vaultRead, readSepolia, processLock, markDirty)
            setTimeout(loopSepolia, delay)
        }
        loopSepolia()

        const loopHoodi = async () => {
            const delay = await pollHoodi(state, processBurn, markDirty)
            setTimeout(loopHoodi, delay)
        }
        loopHoodi()

        const loopBase = async () => {
            const delay = await pollBase(state, processBurn, markDirty)
            setTimeout(loopBase, delay)
        }
        loopBase()

        const loopOptimism = async () => {
            const delay = await pollOptimism(state, processBurn, markDirty)
            setTimeout(loopOptimism, delay)
        }
        loopOptimism()

        const loopArbitrum = async () => {
            const delay = await pollArbitrum(state, processBurn, markDirty)
            setTimeout(loopArbitrum, delay)
        }
        loopArbitrum()

        // ==========================================================
        // POLLING LOOPS (NFT)
        // ==========================================================
        const loopSepoliaNFT = async () => {
            const delay = await pollSepoliaNFT(
                state,
                nftVaultRead,
                readSepolia,
                processNftLock,
                markDirty
            )
            setTimeout(loopSepoliaNFT, delay)
        }
        loopSepoliaNFT()

        const loopHoodiNFT = async () => {
            const delay = await pollHoodiNFT(state, processNftBurn, markDirty)
            setTimeout(loopHoodiNFT, delay)
        }
        loopHoodiNFT()

        const loopBaseNFT = async () => {
            const delay = await pollBaseNFT(state, processNftBurn, markDirty)
            setTimeout(loopBaseNFT, delay)
        }
        loopBaseNFT()

        const loopOptimismNFT = async () => {
            const delay = await pollOptimismNFT(state, processNftBurn, markDirty)
            setTimeout(loopOptimismNFT, delay)
        }
        loopOptimismNFT()

        const loopArbitrumNFT = async () => {
            const delay = await pollArbitrumNFT(state, processNftBurn, markDirty)
            setTimeout(loopArbitrumNFT, delay)
        }
        loopArbitrumNFT()

        // ==========================================================
        // AUTO FLUSH
        // ==========================================================
        setInterval(() => {
            if (isDirty()) {
                console.log("⏳ Auto flush...")
                flush()
            }
        }, flushIntervalMs)

        this._flush = flush
        console.log("🚀 Relayer READY — ERC20 + NFT bridge active.")
    }

    flush() {
        if (this._flush) this._flush()
    }
}