// config.js
import 'dotenv/config'

export const confirmations = parseInt(process.env.CONFIRMATIONS || "1")
export const slowMs  = parseInt(process.env.POLL_SLOW_MS || "2500")
export const fastMs  = parseInt(process.env.POLL_FAST_MS || "800")
export const flushIntervalMs = parseInt(process.env.FLUSH_INTERVAL_MS || "300000")
export const maxProcessed = parseInt(process.env.MAX_PROCESSED_IDS || "1000")

export const statePath = process.env.STATE_FILE || "hybrid-state.json"

// ===== SOURCE CHAIN (Sepolia) =====
export const source = {
    name: "Sepolia",
    read:  process.env.SEPOLIA_READ_RPC,
    wss:   process.env.SEPOLIA_WSS_RPC,
    write: process.env.SEPOLIA_WRITE_RPC,
    vault: process.env.SEPOLIA_VAULT_ADDRESS
}

export const nftVault = {
    address: process.env.SEPOLIA_NFT_VAULT_ADDRESS
};

// ===== DESTINATION CHAINS =====
export const chains = {
    hoodi: {
        key: "hoodi",
        name: "Hoodi",
        chainId: (process.env.HOODI_CHAIN_ID || "560048").toString(),
        read: process.env.HOODI_READ_RPC,
        wss: process.env.HOODI_WSS_RPC,
        write: process.env.HOODI_WRITE_RPC,
        wToken: process.env.HOODI_WMRT_ADDRESS,
        wNFT: process.env.HOODI_WNFT_ADDRESS
    },
    base: {
        key: "base",
        name: "Base",
        chainId: (process.env.BASE_CHAIN_ID || "84532").toString(),
        read: process.env.BASE_READ_RPC,
        wss: process.env.BASE_WSS_RPC,
        write: process.env.BASE_WRITE_RPC,
        wToken: process.env.BASE_WMRT_ADDRESS,
        wNFT: process.env.BASE_WNFT_ADDRESS
    },
    optimism: {
        key: "optimism",
        name: "OptimismSepolia",
        chainId: (process.env.OPTIMISM_CHAIN_ID || "11155420").toString(),
        read: process.env.OPTIMISM_READ_RPC,
        wss: process.env.OPTIMISM_WSS_RPC,
        write: process.env.OPTIMISM_WRITE_RPC,
        wToken: process.env.OPTIMISM_WMRT_ADDRESS,
        wNFT: process.env.OPTIMISM_WNFT_ADDRESS
    },
    arbitrum: {
        key: "arbitrum",
        name: "ArbitrumSepolia",
        chainId: (process.env.ARBITRUM_CHAIN_ID || "421614").toString(),
        read: process.env.ARBITRUM_READ_RPC,
        wss: process.env.ARBITRUM_WSS_RPC,
        write: process.env.ARBITRUM_WRITE_RPC,
        wToken: process.env.ARBITRUM_WMRT_ADDRESS,
        wNFT: process.env.ARBITRUM_WNFT_ADDRESS
    }
}

export const keystore = {
    path: process.env.KEYSTORE_PATH,
    pass: process.env.KEYSTORE_PASSWORD
}
