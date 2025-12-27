// events.js
import { chains } from "./config.js"

export function safeOn(contract, event, handler, label) {
    let attached = false

    const attach = () => {
        try {
            contract.on(event, async (...args) => {
                const ev = args[args.length - 1]
                try { await handler(ev) }
                catch (e) {
                    console.log(`⚠ Listener error [${label}]`, e.message)
                }
            })
            attached = true
            console.log(`🔌 Attached ${label}.${event}`)
        } catch (e) {
            console.log(`❌ Attach failed ${label}`, e.message)
        }
    }

    attach()

    // keep alive every 10 seconds
    setInterval(() => {
        if (!attached) attach()
    }, 10000)
}


export function setupWssListeners(
    vaultWss,
    nftVaultWss,
    {
        onLock,
        onBurn,
        onNftLock,
        onNftBurn
    }
) {

    // ============================================================
    // SOURCE: ERC20 — TokenVault (Sepolia)
    // ============================================================
    if (vaultWss && onLock) {
        safeOn(
            vaultWss,
            "TokensLockedV2",
            onLock,
            "Sepolia-Vault"
        )
    }

    // ============================================================
    // SOURCE: NFT — NFTVault (Sepolia)
    // ============================================================
    if (nftVaultWss && onNftLock) {
        safeOn(
            nftVaultWss,
            "NFTLocked",
            onNftLock,
            "Sepolia-NFTVault"
        )
    }

    // ============================================================
    // DESTINATION CHAINS — ERC20 & NFT
    // ============================================================
    for (const c of Object.values(chains)) {

        // ------------------------
        // wMRT Burns (ERC20)
        // ------------------------
        if (c.wTokenWss && onBurn) {
            safeOn(
                c.wTokenWss,
                "TokensBurned",
                (ev) => onBurn(ev, c.key),
                `${c.name}-wMRT`
            )
        }

        // ------------------------
        // WrappedNFT Burns (NFT)
        // ------------------------
        if (c.wNftWss && onNftBurn) {
            safeOn(
                c.wNftWss,
                "NFTBurned",
                (ev) => onNftBurn(ev, c.key),
                `${c.name}-wNFT`
            )
        }
    }
}
