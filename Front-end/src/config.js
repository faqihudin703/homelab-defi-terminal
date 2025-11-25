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
        },
        HOODI: {
            WMRT: getEnv("VITE_CONTRACT_HOODI_WMRT"),     // wMRT
            DEX: getEnv("VITE_CONTRACT_HOODI_DEX"),
        },
        BASE: {
            WMRT: getEnv("VITE_CONTRACT_BASE_WMRT"),     // wMRT
        }
    }
};