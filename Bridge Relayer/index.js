import 'dotenv/config'
import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// GLOBAL ERROR HANDLERS
process.on("uncaughtException", err => console.log("🔥 Uncaught:", err))
process.on("unhandledRejection", err => console.log("🔥 Unhandled:", err))

class BridgeRelayer {

    constructor() {

        // RPC
        this.sepoliaRpc = process.env.SEPOLIA_RPC_URL
        this.hoodiRpc   = process.env.HOODI_RPC_URL
        this.baseRpc    = process.env.BASE_RPC_URL

        // Contracts
        this.vaultAddr     = process.env.SEPOLIA_VAULT_ADDRESS
        this.wHoodiAddr    = process.env.HOODI_WMRT_ADDRESS
        this.wBaseAddr     = process.env.BASE_WMRT_ADDRESS

        // Chain IDs
        this.hoodiChainId = process.env.HOODI_CHAIN_ID || "560048"
        this.baseChainId  = process.env.BASE_CHAIN_ID  || "84532"

        // Keystore
        this.keystorePath = process.env.KEYSTORE_PATH
        this.keystorePass = process.env.KEYSTORE_PASSWORD

        // Poll intervals
        this.slowMs = 3000   // normal mode (near head)
        this.fastMs = 1000   // fast catch-up mode (if behind)
        this.confirmations = 1

        // State file
        this.statePath = path.resolve(__dirname, "relayer-state.json")

        // Write-state control
        this.stateDirty = false
        this.flushIntervalMs = parseInt(process.env.FLUSH_INTERVAL_MS || String(5*60*1000)) // 5 minutes
        this.nextFlushTime = Date.now() + this.flushIntervalMs
    }

    loadAbi(name) {
        const file = fs.readFileSync(path.resolve(__dirname, "abi", name), "utf8")
        const json = JSON.parse(file)
        return json.abi || json
    }

    loadState(defaultState) {
        if (!fs.existsSync(this.statePath)) return defaultState
        try {
            return JSON.parse(fs.readFileSync(this.statePath, "utf8"))
        } catch {
            return defaultState
        }
    }

    saveState() {
        this.stateDirty = true
    }

    flushStateToDisk() {
        if (!this.stateDirty) return
        try {
            fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
            console.log("💾 State saved.")
            this.stateDirty = false
            this.nextFlushTime = Date.now() + this.flushIntervalMs
        } catch (err) {
            console.log("❌ State flush fail:", err.message)
        }
    }

    async init() {
        console.log("\n🔄 Initializing Relayer (NO-ANCHOR + FAST CATCH-UP)")

        // Providers
        this.pSepolia = new ethers.JsonRpcProvider(this.sepoliaRpc)
        this.pHoodi   = new ethers.JsonRpcProvider(this.hoodiRpc)
        this.pBase    = new ethers.JsonRpcProvider(this.baseRpc)

        // Wallet
        const keyJson = fs.readFileSync(this.keystorePath, "utf8")
        const wallet  = await ethers.Wallet.fromEncryptedJson(keyJson, this.keystorePass)

        this.rSepolia = wallet.connect(this.pSepolia)
        this.rHoodi   = wallet.connect(this.pHoodi)
        this.rBase    = wallet.connect(this.pBase)

        // ABIs
        const vaultAbi = this.loadAbi("TokenVault.json")
        const wAbi     = this.loadAbi("wMRT.json")

        this.vault   = new ethers.Contract(this.vaultAddr, vaultAbi, this.rSepolia)
        this.wHoodi  = new ethers.Contract(this.wHoodiAddr, wAbi, this.rHoodi)
        this.wBase   = new ethers.Contract(this.wBaseAddr,  wAbi, this.rBase)

        // Initial block setup
        const headS = await this.pSepolia.getBlockNumber()
        const headH = await this.pHoodi.getBlockNumber()
        const headB = await this.pBase.getBlockNumber()

        const defaults = {
            sepoliaBlock: headS - this.confirmations,
            hoodiBlock:   headH - this.confirmations,
            baseBlock:    headB - this.confirmations,
            processedTransferIds: []
        }

        this.state = this.loadState(defaults)

        console.log("📁 Sync points:")
        console.log("   Sepolia:", this.state.sepoliaBlock)
        console.log("   Hoodi:  ", this.state.hoodiBlock)
        console.log("   Base:   ", this.state.baseBlock)
    }

    // retry logic
    async txRetry(fn, label) {
        for (let i = 1; i <= 5; i++) {
            try {
                const tx = await fn()
                console.log(`⏳ TX [${label}] → ${tx.hash}`)
                return await tx.wait(1)
            } catch(err) {
                const msg = err.message || ""
                if (msg.includes("processed") || msg.includes("already")) throw err
                console.log(`⚠️ Retry ${i}/5:`, msg)
                await new Promise(r => setTimeout(r, 500*i))
            }
        }
    }

    async processLock(ev) {
        try {
            const [user, destWrapped, recipient, amount, nonce, destChainId, transferId] = ev.args

            if (this.state.processedTransferIds.includes(transferId)) {
                console.log(`⏩ Skip mint: ${transferId}`)
                return
            }

            const chain = destChainId.toString()
            let fn

            if (chain === this.hoodiChainId) fn = () => this.wHoodi.mintWrapped(recipient, amount, transferId)
            else if (chain === this.baseChainId) fn = () => this.wBase.mintWrapped(recipient, amount, transferId)
            else return console.log("⚠ Unknown dest chain")

            try {
                const rc = await this.txRetry(fn, `Mint ${chain}`)
                console.log("🎉 Mint OK:", rc.hash)
                this.state.processedTransferIds.push(transferId)
              	if (this.state.processedTransferIds.length > 1000) {
        			this.state.processedTransferIds.shift()
    			}
                this.saveState()
            } catch(err) {
                if ((err.message||"").includes("processed")) {
                    console.log(`⚠ Already minted → mark processed ${transferId}`)
                    this.state.processedTransferIds.push(transferId)
                    this.saveState()
                    return
                }
                console.log("❌ Mint error:", err.message)
            }

        } catch(e) {
            console.log("❌ processLock:", e.message)
        }
    }

    async processBurn(user, amount, transferId, source) {
        try {
            if (this.state.processedTransferIds.includes(transferId)) {
                console.log(`⏩ Skip release: ${transferId}`)
                return
            }

            const chainId = source === "Hoodi" ? this.hoodiChainId : this.baseChainId
            const fn = () => this.vault.releaseV2(user, amount, chainId, transferId)

            try {
                const rc = await this.txRetry(fn, `Release ${source}`)
                console.log("🎉 Release OK:", rc.hash)
                this.state.processedTransferIds.push(transferId)
              	if (this.state.processedTransferIds.length > 1000) {
        			this.state.processedTransferIds.shift()
    			}
                this.saveState()
            } catch(err) {
                if ((err.message||"").includes("processed") || err.message.includes("already")) {
                    console.log(`⚠ Already released → mark processed`)
                    this.state.processedTransferIds.push(transferId)
                    this.saveState()
                    return
                }
                console.log("❌ Release error:", err.message)
            }

        } catch(e) {
            console.log("❌ processBurn:", e.message)
        }
    }

    // poll one block at a time
    async pollOneSepolia() {
        const b = this.state.sepoliaBlock + 1
        const head = (await this.pSepolia.getBlockNumber()) - this.confirmations
        if (b > head) return false

        console.log(`🔎 Sepolia block ${b}`)
        const evs = await this.vault.queryFilter(this.vault.filters.TokensLockedV2(), b, b)
        for (const ev of evs) await this.processLock(ev)

        this.state.sepoliaBlock = b
        this.saveState()
        return true
    }

    async pollOneHoodi() {
        const b = this.state.hoodiBlock + 1
        const head = (await this.pHoodi.getBlockNumber()) - this.confirmations
        if (b > head) return false

        console.log(`🟢 Hoodi block ${b}`)
        const evs = await this.wHoodi.queryFilter(this.wHoodi.filters.TokensBurned(), b, b)
        for (const ev of evs) {
            const [user, amt, tid] = ev.args
            await this.processBurn(user, amt, tid, "Hoodi")
        }

        this.state.hoodiBlock = b
        this.saveState()
        return true
    }

    async pollOneBase() {
        const b = this.state.baseBlock + 1
        const head = (await this.pBase.getBlockNumber()) - this.confirmations
        if (b > head) return false

        console.log(`🔵 Base block ${b}`)
        const evs = await this.wBase.queryFilter(this.wBase.filters.TokensBurned(), b, b)
        for (const ev of evs) {
            const [user, amt, tid] = ev.args
            await this.processBurn(user, amt, tid, "Base")
        }

        this.state.baseBlock = b
        this.saveState()
        return true
    }

    async start() {
        await this.init()

        console.log("\n🚀 Relayer ACTIVE (NO ANCHOR, NO SKIP, FAST CATCH-UP)\n")

        // listeners
        this.vault.on("TokensLockedV2", (...args) => {
            const ev = args[args.length-1]
            
            if (this.state.processedTransferIds.includes(transferId)) {
        		console.log(`⏩ Skip listener duplicate: ${transferId}`)
        		return
    		}
          
            console.log("🟣 Listener: Sepolia Lock")
            this.processLock(ev)
        })

        this.wHoodi.on("TokensBurned", (...args) => {
            const [user, amt, tid] = args
            
            const transferId = tid
            
            if (this.state.processedTransferIds.includes(transferId)) {
    			console.log(`⏩ Skip listener duplicate burn: ${transferId}`)
    			return
			}
          
            console.log("🟣 Listener: Hoodi Burn")
            this.processBurn(user, amt, tid, "Hoodi")
        })

        this.wBase.on("TokensBurned", (...args) => {
            const [user, amt, tid] = args
            
            const transferId = tid
            
            if (this.state.processedTransferIds.includes(transferId)) {
    			console.log(`⏩ Skip listener duplicate burn: ${transferId}`)
    			return
			}
          
            console.log("🟣 Listener: Base Burn")
            this.processBurn(user, amt, tid, "Base")
        })

        // POLL LOOPS (never skip a block)

        // SEPOLIA
        const pollSep = async () => {
            const behind = ((await this.pSepolia.getBlockNumber()) - this.confirmations) - this.state.sepoliaBlock
            const delay = behind > 20 ? this.fastMs : this.slowMs
            const hasMore = await this.pollOneSepolia()
            setTimeout(pollSep, delay)
        }
        pollSep()

        // HOODI
        const pollH = async () => {
            const behind = ((await this.pHoodi.getBlockNumber()) - this.confirmations) - this.state.hoodiBlock
            const delay = behind > 20 ? this.fastMs : this.slowMs
            const hasMore = await this.pollOneHoodi()
            setTimeout(pollH, delay)
        }
        pollH()

        // BASE
        const pollB = async () => {
            const behind = ((await this.pBase.getBlockNumber()) - this.confirmations) - this.state.baseBlock
            const delay = behind > 20 ? this.fastMs : this.slowMs
            const hasMore = await this.pollOneBase()
            setTimeout(pollB, delay)
        }
        pollB()

        // periodic flush scheduler
        setInterval(() => {
            if (Date.now() >= this.nextFlushTime && this.stateDirty) {
                console.log("⏳ Flushing state...")
                this.flushStateToDisk()
            }
        }, 10_000)
    }
}

const service = new BridgeRelayer()
service.start()

// graceful shutdown
const exitFlush = () => {
    console.log("⚠️ Exit detected → flush state...")
    service.flushStateToDisk()
    process.exit()
}
process.on("SIGINT", exitFlush)
process.on("SIGTERM", exitFlush)
process.on("beforeExit", exitFlush)
