// providers.js
import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chains, source, keystore, nftVault  } from './config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

function loadAbi(name) {
    const raw = fs.readFileSync(path.join(__dirname, "abi", name), "utf8")
    const j = JSON.parse(raw)
    return j.abi || j
}

export async function initProviders() {
    // ------------------------------------------
    // 1) Load wallet (signer)
    // ------------------------------------------
    const keystoreJson = fs.readFileSync(keystore.path, "utf8")
    const wallet = await ethers.Wallet.fromEncryptedJson(keystoreJson, keystore.pass)
    console.log("🔐 Relayer Wallet:", wallet.address)

    // ------------------------------------------
    // 2) Load ABIs
    // ------------------------------------------
    const tokenVaultAbi = loadAbi("TokenVault.json")
    const wTokenAbi     = loadAbi("wMRT.json")
    const nftVaultAbi   = loadAbi("NFTVault.json")
    const wNftAbi       = loadAbi("WrappedNFT.json")

    // ------------------------------------------
    // 3) SOURCE PROVIDERS (SEPOLIA)
    // ------------------------------------------
    const readSepolia  = new ethers.JsonRpcProvider(source.read)   // PUBLIC RPC
    const writeSepolia = wallet.connect(new ethers.JsonRpcProvider(source.write)) // INFURA / PRIVATE RPC
    const wssSepolia   = source.wss ? new ethers.WebSocketProvider(source.wss) : null

    // Token Vault (ERC20)
    const vaultRead  = new ethers.Contract(source.vault, tokenVaultAbi, readSepolia)
    const vaultWrite = new ethers.Contract(source.vault, tokenVaultAbi, writeSepolia)
    const vaultWss   = wssSepolia ? new ethers.Contract(source.vault, tokenVaultAbi, wssSepolia) : null

    // NFT Vault (ERC721)
    const nftVaultRead  = nftVault.address ? new ethers.Contract(nftVault.address, nftVaultAbi, readSepolia) : null
    const nftVaultWrite = nftVault.address ? new ethers.Contract(nftVault.address, nftVaultAbi, writeSepolia) : null
    const nftVaultWss   = (wssSepolia && nftVault.address) ? new ethers.Contract(nftVault.address, nftVaultAbi, wssSepolia) : null

    // ------------------------------------------
    // 4) DESTINATION CHAIN PROVIDERS
    // ------------------------------------------
    for (const c of Object.values(chains)) {
        // READ provider (PUBLIC RPC)
        c.readProvider = c.read ? new ethers.JsonRpcProvider(c.read) : null

        // WRITE provider (Infura/private RPC)
        c.writeSigner = c.write ? wallet.connect(new ethers.JsonRpcProvider(c.write)) : null

        // WSS provider (optional)
        c.wssProvider = c.wss ? new ethers.WebSocketProvider(c.wss) : null

        // -------------------------
        // ERC20 Wrapped Token
        // -------------------------
        c.wTokenRead  =
            c.readProvider && c.wToken
                ? new ethers.Contract(c.wToken, wTokenAbi, c.readProvider)
                : null

        c.wTokenWrite =
            c.writeSigner && c.wToken
                ? new ethers.Contract(c.wToken, wTokenAbi, c.writeSigner)
                : null

        c.wTokenWss =
            c.wssProvider && c.wToken
                ? new ethers.Contract(c.wToken, wTokenAbi, c.wssProvider)
                : null

        // -------------------------
        // ERC721 Wrapped NFT
        // -------------------------
        c.wNftRead =
            c.readProvider && c.wNFT
                ? new ethers.Contract(c.wNFT, wNftAbi, c.readProvider)
                : null

        c.wNftWrite =
            c.writeSigner && c.wNFT
                ? new ethers.Contract(c.wNFT, wNftAbi, c.writeSigner)
                : null

        c.wNftWss =
            c.wssProvider && c.wNFT
                ? new ethers.Contract(c.wNFT, wNftAbi, c.wssProvider)
                : null
    }

    // ------------------------------------------
    // Return object to relayer.js
    // ------------------------------------------
    return {
        wallet,
        readSepolia,
        writeSepolia,

        vaultRead,
        vaultWrite,
        vaultWss,

        nftVaultRead,
        nftVaultWrite,
        nftVaultWss
    }
}