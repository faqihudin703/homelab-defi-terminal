// src/config.js

// Helper untuk validasi (opsional, agar tidak error jika lupa isi .env)
const getEnv = (key) => {
    const value = import.meta.env[key];
    if (!value) console.warn(`⚠️ Config Missing: ${key}`);
    return value || "";
};

export const CONFIG = {
    NETWORKS: {
        SEPOLIA: {
            NAME: "Sepolia Testnet",
            CHAIN_ID: getEnv("VITE_SEPOLIA_CHAIN_ID"),
            RPC_URL: getEnv("VITE_SEPOLIA_RPC_URL"),
        },
        HOODI: {
            NAME: "Hoodi Testnet",
            CHAIN_ID: getEnv("VITE_HOODI_CHAIN_ID"),
            RPC_URL: getEnv("VITE_HOODI_RPC_URL"),
        },
        BASE: {
            NAME: "Base Sepolia Testnet",
            CHAIN_ID: getEnv("VITE_BASE_CHAIN_ID"),
            RPC_URL: getEnv("VITE_BASE_RPC_URL"),
        },
        OPTIMISM: {
            NAME: "Optimism Sepolia Testnet",
            CHAIN_ID: getEnv("VITE_OP_CHAIN_ID"),
            RPC_URL: getEnv("VITE_OP_RPC_URL"),
        },
        ARBITRUM: {
            NAME: "Arbitrum Sepolia Testnet",
            CHAIN_ID: getEnv("VITE_ARB_CHAIN_ID"),
            RPC_URL: getEnv("VITE_ARB_RPC_URL"),
        }
    },
    CONTRACTS: {
        SEPOLIA: {
            TOKEN: getEnv("VITE_CONTRACT_SEPOLIA_TOKEN"), // MRT
            VAULT: getEnv("VITE_CONTRACT_SEPOLIA_VAULT"), // TokenVault
            DEX: getEnv("VITE_CONTRACT_SEPOLIA_DEX"),
            STABLE: {
                ADDR: getEnv("VITE_CONTRACT_SEPOLIA_STABLE"),
                TOKEN_A: getEnv("VITE_CONTRACT_SEPOLIA_MRTT"),
                TOKEN_B: getEnv("VITE_CONTRACT_SEPOLIA_MRTC"),
            },
            NFT: getEnv("VITE_CONTRACT_SEPOLIA_NFT"),           // HomelabCollection
            NFT_VAULT: getEnv("VITE_CONTRACT_SEPOLIA_NFT_VAULT"), // NFTVault
        },
        HOODI: {
            WMRT: getEnv("VITE_CONTRACT_HOODI_WMRT"),     // wMRT
            DEX: getEnv("VITE_CONTRACT_HOODI_DEX"),
            WNFT: getEnv("VITE_CONTRACT_HOODI_WNFT"),
        },
        BASE: {
            WMRT: getEnv("VITE_CONTRACT_BASE_WMRT"),     // wMRT
            DEX: getEnv("VITE_CONTRACT_BASE_DEX"),
            WNFT: getEnv("VITE_CONTRACT_BASE_WNFT"),
        },
        OPTIMISM: { 
            WMRT: getEnv("VITE_CONTRACT_OP_WMRT"),
            DEX: getEnv("VITE_CONTRACT_OP_DEX"),
            WNFT: getEnv("VITE_CONTRACT_OP_WNFT"),
        },
        ARBITRUM: { 
            WMRT: getEnv("VITE_CONTRACT_ARB_WMRT"),
            DEX: getEnv("VITE_CONTRACT_ARB_DEX"),
            WNFT: getEnv("VITE_CONTRACT_ARB_WNFT"),
        }
    },
    WATCHER: {
        API_URL: getEnv("VITE_WATCHER_API_URL"), // URL Backend
        API_KEY: getEnv("VITE_WATCHER_API_KEY")  // <--- TAMBAHKAN INI
    },
    PINATA: {
        JWT: getEnv("VITE_PINATA_JWT")
    }
};