import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONFIG } from "../config";
import { useWeb3 } from "../context/Web3Context";

// === ABI ===
// 3 ABI diperlukan (StableSwap, Token A, Token B)
import StableSwapABI from "../abis/StableSwap.json";
import TokenAABI from "../abis/MRTT.json";
import TokenBABI from "../abis/MRTC.json";

export default function StableSwap() {
    const { account, chainId, provider } = useWeb3();
    const chainIdNum = Number(chainId);

    const [activeTab, setActiveTab] = useState("swap");
    const [status, setStatus] = useState("");
    const [feeBps, setFeeBps] = useState(4);
    const [userBalA, setUserBalA] = useState("0");
    const [userBalB, setUserBalB] = useState("0");
    const [isMinter, setIsMinter] = useState(false);

    const [poolData, setPoolData] = useState({
        reserveA: 0n,
        reserveB: 0n,
        decimalsA: 18,
        decimalsB: 18,
        lpBalance: 0n,
        symbolA: "MRTT",
        symbolB: "MRTC"
    });

    const [isAtoB, setIsAtoB] = useState(true);
    const [swapInput, setSwapInput] = useState("");
    const [swapOutput, setSwapOutput] = useState("");

    const [liqA, setLiqA] = useState("");
    const [liqB, setLiqB] = useState("");
    const [removeLp, setRemoveLp] = useState("");

    const [inputs, setInputs] = useState({
        mintRecipientA: "",
        mintAmountA: "",
        mintRecipientB: "",
        mintAmountB: ""
    });

    const isSepolia = chainIdNum === Number(CONFIG.NETWORKS.SEPOLIA.CHAIN_ID);
    const STABLE = CONFIG.CONTRACTS.SEPOLIA.STABLE;

    // ================= SAFE SIGNER =================
    const getFreshSigner = async () => {
        if (!provider) {
            throw new Error("Wallet belum terhubung");
        }
        return await provider.getSigner();
    };

    // ================= LOAD POOL =================
    const updateData = async () => {
        if (!account || !isSepolia) return;

        try {
            const rpc = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);

            const stable = new ethers.Contract(STABLE.ADDR, StableSwapABI, rpc);
            const tokenA = new ethers.Contract(STABLE.TOKEN_A, TokenAABI, rpc);
            const tokenB = new ethers.Contract(STABLE.TOKEN_B, TokenBABI, rpc);

            const [fee, resA, resB, lpBal, decA, decB, symA, symB, balA, balB] =
                await Promise.all([
                    stable.feeBps(),
                    tokenA.balanceOf(STABLE.ADDR),
                    tokenB.balanceOf(STABLE.ADDR),
                    stable.balanceOf(account),
                    tokenA.decimals(),
                    tokenB.decimals(),
                    tokenA.symbol(),
                    tokenB.symbol(),
                    tokenA.balanceOf(account),
                    tokenB.balanceOf(account),
                ]);

            setFeeBps(Number(fee));
            setUserBalA(ethers.formatUnits(balA, decA));
            setUserBalB(ethers.formatUnits(balB, decB));

            setPoolData({
                reserveA: resA,
                reserveB: resB,
                lpBalance: lpBal,
                decimalsA: Number(decA),
                decimalsB: Number(decB),
                symbolA: symA,
                symbolB: symB
            });
        } catch (e) {
            console.error("updateData error:", e);
        }
    };

    const checkMinter = async () => {
        if (!account) return;
        try {
            const rpc = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
            const tokenA = new ethers.Contract(STABLE.TOKEN_A, TokenAABI, rpc);
            const tokenB = new ethers.Contract(STABLE.TOKEN_B, TokenBABI, rpc);

            const [roleA, roleB] = await Promise.all([
                tokenA.MINTER_ROLE(),
                tokenB.MINTER_ROLE()
            ]);

            const ok =
                (await tokenA.hasRole(roleA, account)) &&
                (await tokenB.hasRole(roleB, account));

            setIsMinter(ok);
        } catch {
            setIsMinter(false);
        }
    };

    useEffect(() => {
        updateData();
        checkMinter();
        const i = setInterval(updateData, 10000);
        return () => clearInterval(i);
    }, [account, chainIdNum]);

    // ======================================
    // SWAP PREVIEW (x * y = k)
    // ======================================
    const handleSwapInput = (val) => {
        setSwapInput(val);

        if (!val || isNaN(val)) {
            setSwapOutput("");
            return;
        }

        const decimalsIn = isAtoB ? poolData.decimalsA : poolData.decimalsB;
        const decimalsOut = isAtoB ? poolData.decimalsB : poolData.decimalsA;

        const rInRaw = isAtoB ? poolData.reserveA : poolData.reserveB;
        const rOutRaw = isAtoB ? poolData.reserveB : poolData.reserveA;

        const rIn = Number(ethers.formatUnits(rInRaw, decimalsIn));
        const rOut = Number(ethers.formatUnits(rOutRaw, decimalsOut));

        if (rIn === 0 || rOut === 0) return;

        const effectiveFactor = (10000 - feeBps) / 10000; // e.g. feeBps=4 -> 0.9996
        const inputAfterFee = Number(val) * effectiveFactor;
        const output = (inputAfterFee * rOut) / (rIn + inputAfterFee);

        setSwapOutput(output.toFixed(6));
    };

    // ======================================
    // EXECUTE SWAP
    // ======================================
    const handleSwap = async () => {
        try {
            setStatus(`⏳ Swapping ${isAtoB ? poolData.symbolA : poolData.symbolB} ...`);

            const signer = await getFreshSigner();
            
            const tokenIn = new ethers.Contract(
                isAtoB ? STABLE.TOKEN_A : STABLE.TOKEN_B,
                isAtoB ? TokenAABI : TokenBABI,
                signer
            );
            
            const decimalsIn  = isAtoB ? poolData.decimalsA : poolData.decimalsB;
            const decimalsOut = isAtoB ? poolData.decimalsB : poolData.decimalsA;
            
            const amtIn = ethers.parseUnits(swapInput || "0", decimalsIn);
            
            setStatus(`1/2: Approving ${isAtoB ? poolData.symbolA : poolData.symbolB}...`);
            const allowance = await tokenIn.allowance(await signer.getAddress(), STABLE.ADDR);
            if (allowance < amtIn) {
                await (await tokenIn.approve(STABLE.ADDR, amtIn)).wait();
            }
            
            const stable = new ethers.Contract(STABLE.ADDR, StableSwapABI, signer);
            
            const outEst = Number(swapOutput);
            if (!outEst || outEst <= 0) {
                return setStatus("❌ Estimasi output tidak valid.");
            }
            
            const extraSlippage = 1;
            const totalBps = 10000 - (feeBps + extraSlippage);

            const minOut = ethers.parseUnits(
                (outEst * totalBps / 10000).toString(),
                decimalsOut
            );
            
            setStatus("2/2: Executing swap...");
            
            let tx;
            if (isAtoB) {
                tx = await stable.swapAforB(amtIn, minOut);
            } else {
                tx = await stable.swapBforA(amtIn, minOut);
            }
            
            await tx.wait();
            
            setStatus("✅ Swap berhasil!");
            setSwapInput("");
            setSwapOutput("");
            updateData();
        } catch (err) {
            setStatus("❌ Error: " + err.message);
        }
    };
    
    const handleInputA = (val) => {
        setLiqA(val);
        
        if (!val || isNaN(val)) {
            setLiqB("");
            return;
        }
        
        const rA = Number(ethers.formatUnits(poolData.reserveA, poolData.decimalsA));
        const rB = Number(ethers.formatUnits(poolData.reserveB, poolData.decimalsB));
        
        if (rA === 0 || rB === 0) return;
        
        const neededB = (Number(val) * rB) / rA;
        setLiqB(neededB.toFixed(6));
    };

    const handleInputB = (val) => {
        setLiqB(val);

        if (!val || isNaN(val)) {
            setLiqA("");
            return;
        }

        const rA = Number(ethers.formatUnits(poolData.reserveA, poolData.decimalsA));
        const rB = Number(ethers.formatUnits(poolData.reserveB, poolData.decimalsB));

        if (rA === 0 || rB === 0) return;

        const neededA = (Number(val) * rA) / rB;
        setLiqA(neededA.toFixed(6));
    };


    // ======================================
    // ADD LIQUIDITY
    // ======================================
    const handleAddLiq = async () => {
        if (!liqA || !liqB) {
            setStatus("❌ Masukkan jumlah token!");
            return;
        }
        
        try {
            setStatus("⏳ Adding Liquidity...");

            const signer = await getFreshSigner();
            const stable = new ethers.Contract(STABLE.ADDR, StableSwapABI, signer);
            
            const amountA = ethers.parseUnits(liqA || "0", poolData.decimalsA);
            const amountB = ethers.parseUnits(liqB || "0", poolData.decimalsB);
            
            const tokenA = new ethers.Contract(STABLE.TOKEN_A, TokenAABI, signer);
            const tokenB = new ethers.Contract(STABLE.TOKEN_B, TokenBABI, signer);
            
            // APPROVE TOKEN A
            let allowanceA = await tokenA.allowance(await signer.getAddress(), STABLE.ADDR);
            if (allowanceA < amountA) {
                setStatus("🔑 Approving token A...");
                await (await tokenA.approve(STABLE.ADDR, amountA)).wait();
            }
            
            // APPROVE TOKEN B
            let allowanceB = await tokenB.allowance(await signer.getAddress(), STABLE.ADDR);
            if (allowanceB < amountB) {
                setStatus("🔑 Approving token B...");
                await (await tokenB.approve(STABLE.ADDR, amountB)).wait();
            }
            
            // ADD LIQUIDITY
            await (await stable.addLiquidity(amountA, amountB)).wait();
            setStatus("✅ Liquidity Added!");
            setLiqA("");
            setLiqB("");
            updateData();
        } catch (err) {
            setStatus("❌ Error: " + err.message);
        }
    };

    // ======================================
    // REMOVE LIQUIDITY
    // ======================================
    const handleRemoveLiq = async () => {
        try {
            setStatus("⏳ Removing Liquidity...");

            const signer = await getFreshSigner();
            const stable = new ethers.Contract(STABLE.ADDR, StableSwapABI, signer);
            
            const lpBal = poolData.lpBalance;
            const amtLP = ethers.parseUnits(removeLp, 18);
            if (amtLP > lpBal) {
                return setStatus("❌ Jumlah LP melebihi saldo");
            }
            
            await (await stable.removeLiquidity(amtLP)).wait();
            
            setStatus("✅ Liquidity Removed!");
            setRemoveLp("");
            updateData();
        } catch (err) {
            setStatus("❌ Error: " + err.message);
        }
    };
    
    const handleMint = async (tokenType) => {
        try {
            const signer = await getFreshSigner();
            
            const tokenAddress =
                tokenType === "A"
                    ? CONFIG.CONTRACTS.SEPOLIA.STABLE.TOKEN_A
                    : CONFIG.CONTRACTS.SEPOLIA.STABLE.TOKEN_B;
                    
            const abi = tokenType === "A" ? TokenAABI : TokenBABI;
            
            const token = new ethers.Contract(tokenAddress, abi, signer);
            
            const amount =
                tokenType === "A"
                    ? ethers.parseEther(inputs.mintAmountA)
                    : ethers.parseEther(inputs.mintAmountB);
                    
            const recipient =
                tokenType === "A"
                    ? (inputs.mintRecipientA || account)
                    : (inputs.mintRecipientB || account);
                    
            setStatus(`⏳ Admin: Minting Token ${tokenType}...`);
            
            const tx = await token.mint(recipient, amount);
            setStatus("⏳ Menunggu konfirmasi blok...");
            await tx.wait();
            
            setInputs(prev => ({
                ...prev,
                ...(tokenType === "A"
                    ? { mintAmountA: "", mintRecipientA: "" }
                    : { mintAmountB: "", mintRecipientB: "" })
            }));
            
            setStatus(`✅ Sukses! Token ${tokenType} berhasil dicetak.`);
            updateData();
        } catch (err) {
            setStatus("❌ Gagal: " + err.message);
        }
    };


    // Display values
    const uiResA = Number(ethers.formatUnits(poolData.reserveA, poolData.decimalsA)).toFixed(2);
    const uiResB = Number(ethers.formatUnits(poolData.reserveB, poolData.decimalsB)).toFixed(2);
    const uiLp = Number(ethers.formatUnits(poolData.lpBalance, 18)).toFixed(4);
    const feePercent = (feeBps / 100).toFixed(2);

    // ======================================
    // RENDER
    // ======================================
    if (!isSepolia)
        return <div className="access-denied"><p>Only available on Sepolia Testnet</p></div>;

    return (
    <div className="bridge-container">
      
      {/* STATUS LOG */}
      {status && <div className="status-log">{status}</div>}

      {/* HEADER POOL STATUS */}
      <div className="terminal-card mb-20"
           style={{ borderColor: isSepolia ? 'var(--primary)' : '#555' }}>
        
        <div className="card-header">
          <h3 style={{ color: isSepolia ? 'var(--primary)' : '#999' }}>
            POOL: {poolData.symbolA} / {poolData.symbolB}
          </h3>
        </div>

        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '20px',
            flexWrap: 'wrap'
        }}>
            <span>
                Reserves: <b>{uiResA} {poolData.symbolA}</b>
                {' '} + {' '}
                <b>{uiResB} {poolData.symbolB}</b>
            </span>

            <span>
                Rate:
                <b>
                  1 {poolData.symbolA} ≈ {(uiResB / uiResA).toFixed(4)} {poolData.symbolB}
                </b>
            </span>
            
            <span>
                Fee:
                <b style={{ color: 'var(--primary)' }}>
                    {feeBps} bps ({feePercent}%)
                </b>
            </span>
        </div>
      </div>

      {/* TAB MENU */}
      <div className="dex-tabs">
        <button
          className={activeTab === 'swap' ? 'active' : ''}
          onClick={() => setActiveTab('swap')}
        >
          SWAP
        </button>

        <button
          className={activeTab === 'liquidity' ? 'active' : ''}
          onClick={() => setActiveTab('liquidity')}
        >
          LIQUIDITY
        </button>
        
        {isMinter && (
          <button
            className={activeTab === 'mint' ? 'active' : ''}
            onClick={() => setActiveTab('mint')}
          >
            MINT
          </button>
        )}
        
      </div>

      {/* =============== SWAP SECTION =============== */}
      {activeTab === 'swap' && (
        <div className="bridge-grid">

          {/* KARTU SWAP A → B */}
          <div className="terminal-card">
            <h3>Swap {poolData.symbolA} → {poolData.symbolB}</h3>
            
            <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "5px" }}>
              Balance: {Number(userBalA).toFixed(4)} {poolData.symbolA}
            </div>

            <div className="input-group">
              <label>Bayar ({poolData.symbolA})</label>
              <input
                type="number"
                placeholder="0.0"
                value={isAtoB ? swapInput : ''}
                onChange={(e) => {
                  setIsAtoB(true);
                  handleSwapInput(e.target.value);
                }}
              />
            </div>

            <div className="input-group mt-10">
              <label>Terima ({poolData.symbolB}) <small>Estimasi</small></label>
              <input
                type="text"
                readOnly
                placeholder="0.0"
                value={isAtoB ? swapOutput : ''}
                style={{
                  background: '#1e1e1e',
                  color: '#8b949e',
                  cursor: 'not-allowed'
                }}
              />
            </div>

            <button
              className="btn-transfer mt-20"
              onClick={handleSwap}
            >
              APPROVE & SWAP
            </button>
          </div>

          {/* KARTU SWAP B → A */}
          <div className="terminal-card">
            <h3>Swap {poolData.symbolB} → {poolData.symbolA}</h3>
            
            <div style={{ fontSize: "12px", opacity: 0.8, marginBottom: "5px" }}>
              Balance: {Number(userBalB).toFixed(4)} {poolData.symbolB}
            </div>

            <div className="input-group">
              <label>Bayar ({poolData.symbolB})</label>
              <input
                type="number"
                placeholder="0.0"
                value={!isAtoB ? swapInput : ''}
                onChange={(e) => {
                  setIsAtoB(false);
                  handleSwapInput(e.target.value);
                }}
              />
            </div>

            <div className="input-group mt-10">
              <label>Terima ({poolData.symbolA}) <small>Estimasi</small></label>
              <input
                type="text"
                readOnly
                placeholder="0.0"
                value={!isAtoB ? swapOutput : ''}
                style={{
                  background: '#1e1e1e',
                  color: '#8b949e',
                  cursor: 'not-allowed'
                }}
              />
            </div>

            <button
              className="btn-transfer mt-20"
              onClick={handleSwap}
              style={{ background: '#8e44ad' }}
            >
              APPROVE & SWAP
            </button>
          </div>

        </div>
      )}

      {/* =============== LIQUIDITY SECTION =============== */}
      {activeTab === 'liquidity' && (
        <div>
          <p style={{ textAlign: 'center', marginBottom: '20px' }}>
            Saldo LP Token:
            <b style={{ color: 'var(--blue)' }}>
              {uiLp}
            </b>
          </p>

          <div className="bridge-grid">

            {/* ADD LIQUIDITY */}
            <div className="liquidity-card">
              <h3>Tambah Likuiditas</h3>

              <label>{poolData.symbolA}</label>
              <div className="input-group">
                <input
                  type="number"
                  value={liqA}
                  onChange={(e) => handleInputA(e.target.value)}
                />
              </div>

              <label>{poolData.symbolB}</label>
              <div className="input-group">
                <input
                  type="number"
                  value={liqB}
                  onChange={(e) => handleInputB(e.target.value)}
                />
              </div>

              <button className="btn-lock mt-20" onClick={handleAddLiq}>
                ADD +
              </button>
            </div>

            {/* REMOVE LIQUIDITY */}
            <div className="liquidity-card">
              <h3>Tarik Likuiditas</h3>

              <label>Jumlah LP</label>
              <div className="input-group">
                <input
                  type="number"
                  value={removeLp}
                  onChange={(e) => setRemoveLp(e.target.value)}
                />
              </div>

              <button className="btn-burn mt-20" onClick={handleRemoveLiq}>
                REMOVE -
              </button>
            </div>

          </div>
        </div>
      )}
      
      {/* =============== MINT SECTION =============== */}
      {activeTab === 'mint' && isMinter && (
        <div>
          <p style={{ textAlign: 'center', marginBottom: '20px' }}>
            <b style={{ color: 'var(--secondary)' }}>ADMIN MINT PANEL</b>
          </p>

          <div className="bridge-grid">

            {/* MINT TOKEN A */}
            <div className="liquidity-card">
              <h3>Mint {poolData.symbolA}</h3>

              <label>Penerima</label>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="0xRecipient..."
                  value={inputs.mintRecipientA}
                  onChange={(e) =>
                    setInputs({ ...inputs, mintRecipientA: e.target.value })
                  }
                />
              </div>

              <label>Jumlah ({poolData.symbolA})</label>
              <div className="input-group">
                <input
                  type="number"
                  placeholder="0.0"
                  value={inputs.mintAmountA}
                  onChange={(e) =>
                    setInputs({ ...inputs, mintAmountA: e.target.value })
                  }
                />
              </div>

              <button
                className="btn-transfer mt-20"
                style={{ background: 'var(--secondary)', color: 'black' }}
                onClick={() => handleMint('A')}
              >
                MINT {poolData.symbolA} ⚡
              </button>
            </div>

            {/* MINT TOKEN B */}
            <div className="liquidity-card">
              <h3>Mint {poolData.symbolB}</h3>

              <label>Penerima</label>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="0xRecipient..."
                  value={inputs.mintRecipientB}
                  onChange={(e) =>
                    setInputs({ ...inputs, mintRecipientB: e.target.value })
                  }
                />
              </div>

              <label>Jumlah ({poolData.symbolB})</label>
              <div className="input-group">
                <input
                  type="number"
                  placeholder="0.0"
                  value={inputs.mintAmountB}
                  onChange={(e) =>
                    setInputs({ ...inputs, mintAmountB: e.target.value })
                  }
                />
              </div>

              <button
                className="btn-transfer mt-20"
                style={{ background: 'var(--secondary)', color: 'black' }}
                onClick={() => handleMint('B')}
              >
                MINT {poolData.symbolB} ⚡
              </button>
            </div>

        </div>
    </div>
)}

    </div>
  );
}