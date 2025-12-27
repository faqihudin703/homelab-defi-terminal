// poller.js
import { confirmations, slowMs, fastMs, chains } from './config.js'

// ------------------------------
// SOURCE: SEPOLIA VAULT (using vaultRead now)
// ------------------------------
export async function pollSepolia(state, vaultRead, readProvider, processLock, markDirty) {
    const nextBlock = state.value.sepoliaBlock + 1
    const head = (await readProvider.getBlockNumber()) - confirmations
    if (nextBlock > head) return slowMs

    console.log(`🔎 Sepolia block ${nextBlock}`)

    const evs = await vaultRead.queryFilter(
        vaultRead.filters.TokensLockedV2(),
        nextBlock,
        nextBlock
    )

    for (const ev of evs) await processLock(ev)

    state.value.sepoliaBlock = nextBlock
    markDirty()

    return fastMs
}

export async function pollSepoliaNFT(
    state,
    nftVaultRead,
    readProvider,
    processNftLock,
    markDirty
) {
    if (!nftVaultRead) return slowMs;

    const nextBlock = (state.value.sepoliaNftBlock || 0) + 1;
    const head = (await readProvider.getBlockNumber()) - confirmations;

    if (nextBlock > head) return slowMs;

    console.log(`🔎 Sepolia NFT block ${nextBlock}`);

    const evs = await nftVaultRead.queryFilter(
        nftVaultRead.filters.NFTLocked(),
        nextBlock,
        nextBlock
    );

    for (const ev of evs) {
        await processNftLock(ev);
    }

    // update pointer block
    state.value.sepoliaNftBlock = nextBlock;
    markDirty();

    return fastMs;
}

// HOODI (read contract)
export async function pollHoodi(state, processBurn, markDirty) {
    const c = chains.hoodi
    if (!c.readProvider || !c.wTokenRead) return slowMs

    const nextBlock = (state.value.blocks.hoodi || 0) + 1
    const head = (await c.readProvider.getBlockNumber()) - confirmations
    if (nextBlock > head) return slowMs

    console.log(`🟢 Hoodi block ${nextBlock}`)

    const evs = await c.wTokenRead.queryFilter(
        c.wTokenRead.filters.TokensBurned(),
        nextBlock,
        nextBlock
    )

    for (const ev of evs) {
        const [user, amt, tid] = ev.args
        await processBurn(user, amt, tid, 'hoodi')
    }

    state.value.blocks.hoodi = nextBlock
    markDirty()
    return fastMs
}

export async function pollHoodiNFT(state, processNftBurn, markDirty) {
    const c = chains.hoodi;
    if (!c.readProvider || !c.wNftRead) return slowMs;

    const nextBlock = (state.value.blocks_nft?.hoodi || 0) + 1;
    const head = (await c.readProvider.getBlockNumber()) - confirmations;

    if (nextBlock > head) return slowMs;

    console.log(`🟢 Hoodi NFT block ${nextBlock}`);

    const evs = await c.wNftRead.queryFilter(
        c.wNftRead.filters.NFTBurned(),
        nextBlock,
        nextBlock
    );

    for (const ev of evs) {
        const [transferId, sender, tokenId, originalCollectionAddress, uri] = ev.args;
        await processNftBurn(
            sender,
            tokenId,
            transferId,
            "hoodi",
            originalCollectionAddress,
            uri
        );
    }

    state.value.blocks_nft ??= {};
    state.value.blocks_nft.hoodi = nextBlock;
    markDirty();
    return fastMs;
}

// BASE
export async function pollBase(state, processBurn, markDirty) {
    const c = chains.base
    if (!c.readProvider || !c.wTokenRead) return slowMs

    const nextBlock = (state.value.blocks.base || 0) + 1
    const head = (await c.readProvider.getBlockNumber()) - confirmations
    if (nextBlock > head) return slowMs

    console.log(`🔵 Base block ${nextBlock}`)

    const evs = await c.wTokenRead.queryFilter(
        c.wTokenRead.filters.TokensBurned(),
        nextBlock,
        nextBlock
    )

    for (const ev of evs) {
        const [user, amt, tid] = ev.args
        await processBurn(user, amt, tid, 'base')
    }

    state.value.blocks.base = nextBlock
    markDirty()
    return fastMs
}

export async function pollBaseNFT(state, processNftBurn, markDirty) {
    const c = chains.base;
    if (!c.readProvider || !c.wNftRead) return slowMs;

    const nextBlock = (state.value.blocks_nft?.base || 0) + 1;
    const head = (await c.readProvider.getBlockNumber()) - confirmations;
    if (nextBlock > head) return slowMs;

    console.log(`🔵 Base NFT block ${nextBlock}`);

    const evs = await c.wNftRead.queryFilter(
        c.wNftRead.filters.NFTBurned(),
        nextBlock,
        nextBlock
    );

    for (const ev of evs) {
        const [transferId, sender, tokenId, originalCollectionAddress, uri] = ev.args;
        await processNftBurn(
            sender,
            tokenId,
            transferId,
            "base",
            originalCollectionAddress,
            uri
        );
    }

    state.value.blocks_nft ??= {};
    state.value.blocks_nft.base = nextBlock;
    markDirty();
    return fastMs;
}

// OPTIMISM SEPOLIA
export async function pollOptimism(state, processBurn, markDirty) {
    const c = chains.optimism
    if (!c.readProvider || !c.wTokenRead) return slowMs

    const nextBlock = (state.value.blocks.optimism || 0) + 1
    const head = (await c.readProvider.getBlockNumber()) - confirmations
    if (nextBlock > head) return slowMs

    console.log(`🟠 OptimismSepolia block ${nextBlock}`)

    const evs = await c.wTokenRead.queryFilter(
        c.wTokenRead.filters.TokensBurned(),
        nextBlock,
        nextBlock
    )

    for (const ev of evs) {
        const [user, amt, tid] = ev.args
        await processBurn(user, amt, tid, 'optimism')
    }

    state.value.blocks.optimism = nextBlock
    markDirty()
    return fastMs
}

export async function pollOptimismNFT(state, processNftBurn, markDirty) {
    const c = chains.optimism;
    if (!c.readProvider || !c.wNftRead) return slowMs;

    const nextBlock = (state.value.blocks_nft?.optimism || 0) + 1;
    const head = (await c.readProvider.getBlockNumber()) - confirmations;
    if (nextBlock > head) return slowMs;

    console.log(`🟠 Optimism NFT block ${nextBlock}`);

    const evs = await c.wNftRead.queryFilter(
        c.wNftRead.filters.NFTBurned(),
        nextBlock,
        nextBlock
    );

    for (const ev of evs) {
        const [transferId, sender, tokenId, originalCollectionAddress, uri] = ev.args;
        await processNftBurn(
            sender,
            tokenId,
            transferId,
            "optimism",
            originalCollectionAddress,
            uri
        );
    }

    state.value.blocks_nft ??= {};
    state.value.blocks_nft.optimism = nextBlock;
    markDirty();
    return fastMs;
}

// ARBITRUM SEPOLIA
export async function pollArbitrum(state, processBurn, markDirty) {
    const c = chains.arbitrum
    if (!c.readProvider || !c.wTokenRead) return slowMs

    const nextBlock = (state.value.blocks.arbitrum || 0) + 1
    const head = (await c.readProvider.getBlockNumber()) - confirmations
    if (nextBlock > head) return slowMs

    console.log(`🟣 ArbitrumSepolia block ${nextBlock}`)

    const evs = await c.wTokenRead.queryFilter(
        c.wTokenRead.filters.TokensBurned(),
        nextBlock,
        nextBlock
    )

    for (const ev of evs) {
        const [user, amt, tid] = ev.args
        await processBurn(user, amt, tid, 'arbitrum')
    }

    state.value.blocks.arbitrum = nextBlock
    markDirty()
    return fastMs
}

export async function pollArbitrumNFT(state, processNftBurn, markDirty) {
    const c = chains.arbitrum;
    if (!c.readProvider || !c.wNftRead) return slowMs;

    const nextBlock = (state.value.blocks_nft?.arbitrum || 0) + 1;
    const head = (await c.readProvider.getBlockNumber()) - confirmations;
    if (nextBlock > head) return slowMs;

    console.log(`🟣 Arbitrum NFT block ${nextBlock}`);

    const evs = await c.wNftRead.queryFilter(
        c.wNftRead.filters.NFTBurned(),
        nextBlock,
        nextBlock
    );

    for (const ev of evs) {
        const [transferId, sender, tokenId, originalCollectionAddress, uri] = ev.args;
        await processNftBurn(
            sender,
            tokenId,
            transferId,
            "arbitrum",
            originalCollectionAddress,
            uri
        );
    }

    state.value.blocks_nft ??= {};
    state.value.blocks_nft.arbitrum = nextBlock;
    markDirty();
    return fastMs;
}