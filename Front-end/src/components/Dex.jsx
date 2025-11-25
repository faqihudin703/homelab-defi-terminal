import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

import SwapTokenABI from '../abis/SwapToken.json';
import MRTABI from '../abis/MRT.json';
import wMRTABI from '../abis/wMRT.json';

export default function Dex() {
  const { account, chainId } = useWeb3();
  
  const [activeTab, setActiveTab] = useState('swap'); 
  const [status, setStatus] = useState("");

  // State Data Pool
  const [poolData, setPoolData] = useState({
    ethReserve: "0",
    tokenReserve: "0",
    price: "0",
    lpBalance: "0"
  });

  // --- STATE TERPISAH UNTUK DUA KARTU ---
  
  // Kartu Kiri: ETH -> Token (Buy)
  const [buyInputEth, setBuyInputEth] = useState("");       // User ketik ini
  const [buyOutputToken, setBuyOutputToken] = useState(""); // Ini otomatis (Read-Only)

  // Kartu Kanan: Token -> ETH (Sell)
  const [sellInputToken, setSellInputToken] = useState(""); // User ketik ini
  const [sellOutputEth, setSellOutputEth] = useState("");   // Ini otomatis (Read-Only)

  // State Liquidity (Tetap)
  const [liqInputs, setLiqInputs] = useState({ eth: "", token: "", lp: "" });


  // --- KONFIGURASI ---
  const isSepolia = chainId === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID;
  const isHoodi = chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID;

  let dexAddress, tokenAddress, tokenABI, tokenSymbol, networkName, lptokenSymbol;

  if (isSepolia) {
    dexAddress = CONFIG.CONTRACTS.SEPOLIA.DEX;
    tokenAddress = CONFIG.CONTRACTS.SEPOLIA.TOKEN;
    tokenABI = MRTABI;
    tokenSymbol = "MRT";
    networkName = "Sepolia Testnet";
    lptokenSymbol= "MSLP";
  } else if (isHoodi) {
    dexAddress = CONFIG.CONTRACTS.HOODI.DEX;
    tokenAddress = CONFIG.CONTRACTS.HOODI.WMRT;
    tokenABI = wMRTABI;
    tokenSymbol = "wMRT";
    networkName = "Hoodi Testnet";
    lptokenSymbol= "WMSLP";
  }

  const getFreshSigner = async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask tidak ditemukan");
    }
        
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
        
    return signer; // selalu fresh & stabil di mobile
  };

  // --- UPDATE POOL DATA ---
  const updatePoolData = async () => {
    if (!account || (!isSepolia && !isHoodi)) return;
    try {
      const rpcUrl = isSepolia ? CONFIG.NETWORKS.SEPOLIA.RPC_URL : CONFIG.NETWORKS.HOODI.RPC_URL;
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const dexContract = new ethers.Contract(dexAddress, SwapTokenABI, provider);
      
      const reserves = await dexContract.getReserves();
      // reserves[0] = Token, reserves[1] = ETH
      const tokenRes = parseFloat(ethers.formatEther(reserves[0]));
      const ethRes = parseFloat(ethers.formatEther(reserves[1]));

      let price = 0;
      if (ethRes > 0) {
         price = tokenRes / ethRes; // 1 ETH dapat sekian Token
      }

      const lpBal = await dexContract.balanceOf(account);

      setPoolData({
        ethReserve: ethRes.toFixed(4),
        tokenReserve: tokenRes.toFixed(2),
        price: price, // Ratio harga
        lpBalance: parseFloat(ethers.formatEther(lpBal)).toFixed(4)
      });
    } catch (err) {
      console.error("Gagal fetch pool:", err);
    }
  };

  useEffect(() => {
    updatePoolData();
    const interval = setInterval(updatePoolData, 5000);
    return () => clearInterval(interval);
  }, [account, chainId]);


  // --- LOGIKA HITUNG ESTIMASI (TERPISAH) ---

  // 1. Hitung Output Kiri (ETH -> Token)
  const handleBuyInput = (val) => {
    setBuyInputEth(val);
    if (!val || isNaN(val) || parseFloat(poolData.price) === 0) {
        setBuyOutputToken(""); 
        return;
    }
    // Est: Input ETH * Price
    const est = parseFloat(val) * parseFloat(poolData.price);
    setBuyOutputToken(est.toFixed(4));
  };

  // 2. Hitung Output Kanan (Token -> ETH)
  const handleSellInput = (val) => {
    setSellInputToken(val);
    if (!val || isNaN(val) || parseFloat(poolData.price) === 0) {
        setSellOutputEth("");
        return;
    }
    // Est: Input Token / Price
    const est = parseFloat(val) / parseFloat(poolData.price);
    setSellOutputEth(est.toFixed(6));
  };


  // --- EKSEKUSI TRANSAKSI ---

  const executeSwapEthToToken = async () => {
    setStatus(`⏳ Swapping ETH -> ${tokenSymbol}...`);
    try {
        const signer = await getFreshSigner();
        const dex = new ethers.Contract(dexAddress, SwapTokenABI, signer);
        const amountIn = ethers.parseEther(buyInputEth);
        
        const tx = await dex.swapEthToToken(0, { value: amountIn });
        await tx.wait();
        
        setStatus("✅ Swap Berhasil!");
        setBuyInputEth(""); setBuyOutputToken("");
        setTimeout(updatePoolData, 2000);
    } catch (err) { setStatus("❌ Gagal: " + (err.reason || err.message)); }
  };

  const executeSwapTokenToEth = async () => {
    setStatus(`⏳ Swapping ${tokenSymbol} -> ETH...`);
    try {
        let tokenABI = isSepolia ? MRTABI : wMRTABI;
        
        const signer = await getFreshSigner();
        const dex = new ethers.Contract(dexAddress, SwapTokenABI, signer);
        const token = new ethers.Contract(tokenAddress, tokenABI, signer);
        const amountIn = ethers.parseEther(sellInputToken);
        
        setStatus(`1/2: Approve ${tokenSymbol}...`);
        await (await token.approve(dexAddress, amountIn)).wait();
        
        setStatus("2/2: Executing Swap...");
        await (await dex.swapTokenToEth(amountIn, 0)).wait();
        
        setStatus("✅ Swap Berhasil!");
        setSellInputToken(""); 
        setSellOutputEth("");
        setTimeout(updatePoolData, 2000);
    } catch (err) { setStatus("❌ Gagal: " + (err.reason || err.message)); }
  };

  // --- LIQUIDITY HANDLERS (Sama seperti sebelumnya) ---
  const handleLiquidityCalc = (type, value) => {
    if (type === 'eth') setLiqInputs(prev => ({ ...prev, eth: value }));
    if (type === 'token') setLiqInputs(prev => ({ ...prev, token: value }));

    if (parseFloat(poolData.ethReserve) === 0 || !value) return;

    if (type === 'eth') {
        const calcToken = (parseFloat(value) * parseFloat(poolData.price)).toFixed(6);
        setLiqInputs(prev => ({ ...prev, eth: value, token: calcToken }));
    } else {
        const calcEth = (parseFloat(value) / parseFloat(poolData.price)).toFixed(6);
        setLiqInputs(prev => ({ ...prev, token: value, eth: calcEth }));
    }
  };

  const handleAddLiq = async () => {
    setStatus("⏳ Menambah Likuiditas...");
    try {
        let tokenABI = isSepolia ? MRTABI : wMRTABI;

        const signer = await getFreshSigner();
        const dex = new ethers.Contract(dexAddress, SwapTokenABI, signer);
        const token = new ethers.Contract(tokenAddress, tokenABI, signer);

        const ethWei = ethers.parseEther(liqInputs.eth);

        // --- GET RESERVES ---
        const [tokenReserveBN, ethReserveBN] = await dex.getReserves();
        const tokenReserve = BigInt(tokenReserveBN.toString());
        const ethReserve = BigInt(ethReserveBN.toString());

        // --- CALCULATE TOKEN NEEDED ---
        // kalau pool masih kosong: tokenDesired pakai input user
        let tokenNeeded;
        if (ethReserve === 0n) {
            tokenNeeded = ethers.parseEther(liqInputs.token);
        } else {
            tokenNeeded = (ethWei * tokenReserve) / ethReserve;
        }

        setStatus(`1/2: Approve ${tokenSymbol}...`);
        await (await token.approve(dexAddress, tokenNeeded)).wait();

        // 2. ADD
        setStatus("2/2: Deposit Pair...");
        await (await dex.addLiquidity(tokenNeeded, { value: ethWei })).wait();
        
        setStatus("✅ Likuiditas Ditambahkan!");
        setLiqInputs({ eth: "", token: "", lp: "" });
        setTimeout(updatePoolData, 2000);
    } catch (err) {
        console.log(err);
        setStatus("❌ Gagal: " + err.message);
    }
  };

  const handleRemoveLiq = async () => {
    try {
        if (!liqInputs.removeLiqLp || Number(liqInputs.removeLiqLp) <= 0) {
            return setStatus("❌ Masukkan jumlah LP terlebih dahulu.");
        }

        setStatus("⏳ Menarik Likuiditas...");

        const signer = await getFreshSigner();
        const dex = new ethers.Contract(dexAddress, SwapTokenABI, signer);

        const lpWei = ethers.parseEther(liqInputs.removeLiqLp);

        // Optional: cek balance LP biar tidak error burn
        const userAddr = await signer.getAddress();
        const lpBalance = await dex.balanceOf(userAddr);
        if (lpWei > lpBalance) {
            return setStatus("❌ Jumlah LP melebihi saldo kamu.");
        }

        await (await dex.removeLiquidity(lpWei, 0, 0)).wait();

        setStatus("✅ Likuiditas Ditarik!");
        setLiqInputs(prev => ({ ...prev, lp: "" }));
        setTimeout(updatePoolData, 2000);

    } catch (err) {
        setStatus("❌ Gagal: " + err.message);
    }
  };


  if (!isSepolia && !isHoodi) return <div className="access-denied"><p>Network tidak didukung.</p></div>;

  return (
    <div className="bridge-container">
      
      {status && <div className="status-log">{status}</div>}

      {/* HEADER POOL STATUS */}
      <div className="terminal-card mb-20" style={{ borderColor: isSepolia ? 'var(--primary)' : 'var(--secondary)' }}>
        <div className="card-header">
             <h3 style={{ color: isSepolia ? 'var(--primary)' : 'var(--secondary)' }}>
                POOL: ETH / {tokenSymbol}
             </h3>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
            <span>Reserves: <b>{poolData.ethReserve} ETH</b> + <b>{poolData.tokenReserve} {tokenSymbol}</b></span>
            <span>Rate: <b>1 ETH ≈ {parseFloat(poolData.price).toFixed(4)} {tokenSymbol}</b></span>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="dex-tabs">
         <button className={activeTab==='swap'?'active':''} onClick={() => setActiveTab('swap')}>SWAP</button>
         <button className={activeTab==='liquidity'?'active':''} onClick={() => setActiveTab('liquidity')}>LIQUIDITY</button>
      </div>

      {/* === LAYOUT GRID DUA KARTU (ORIGINAL STYLE) === */}
      {activeTab === 'swap' && (
        <div className="bridge-grid">
            
            {/* KARTU 1: BELI (ETH -> TOKEN) */}
            <div className="terminal-card">
                <h3>Beli {tokenSymbol}</h3>
                <p style={{fontSize:'0.8rem', color:'#888', marginBottom:'10px'}}>Gunakan ETH untuk membeli Token</p>
                
                {/* INPUT (PAY) */}
                <div className="input-group">
                    <label>Bayar (ETH)</label>
                    <input 
                        type="number" placeholder="0.0"
                        value={buyInputEth}
                        onChange={(e) => handleBuyInput(e.target.value)}
                    />
                </div>

                {/* OUTPUT (RECEIVE - READ ONLY) */}
                <div className="input-group mt-10">
                    <label>Terima ({tokenSymbol}) <small>Estimasi</small></label>
                    <input 
                        type="text" placeholder="0.0" readOnly
                        value={buyOutputToken}
                        style={{ background: '#1e1e1e', color: '#8b949e', cursor: 'not-allowed' }} 
                    />
                </div>

                <button className="btn-transfer mt-20" onClick={executeSwapEthToToken}>
                    SWAP ⬇️
                </button>
            </div>

            {/* KARTU 2: JUAL (TOKEN -> ETH) */}
            <div className="terminal-card">
                <h3>Jual {tokenSymbol}</h3>
                <p style={{fontSize:'0.8rem', color:'#888', marginBottom:'10px'}}>Tukar Token kembali ke ETH</p>

                {/* INPUT (PAY) */}
                <div className="input-group">
                    <label>Bayar ({tokenSymbol})</label>
                    <input 
                        type="number" placeholder="0.0"
                        value={sellInputToken}
                        onChange={(e) => handleSellInput(e.target.value)}
                    />
                </div>

                {/* OUTPUT (RECEIVE - READ ONLY) */}
                <div className="input-group mt-10">
                    <label>Terima (ETH) <small>Estimasi</small></label>
                    <input 
                        type="text" placeholder="0.0" readOnly
                        value={sellOutputEth}
                        style={{ background: '#1e1e1e', color: '#8b949e', cursor: 'not-allowed' }}
                    />
                </div>

                <button className="btn-transfer mt-20" onClick={executeSwapTokenToEth} style={{ background: '#8e44ad' }}>
                    APPROVE & SWAP ⬆️
                </button>
            </div>
        </div>
      )}

      {/* CONTENT LIQUIDITY (TETAP SAMA) */}
      {activeTab === 'liquidity' && (
        <div>
            <p style={{textAlign: 'center', marginBottom: '20px'}}>
                Saldo LP Token: <b style={{color: 'var(--blue)'}}>{poolData.lpBalance} {lptokenSymbol}</b>
            </p>
            <div className="bridge-grid">
                <div className="liquidity-card">
                    <h3>Tambah Likuiditas</h3>
                    <label>ETH</label>
                    <div className="input-group">
                        <input 
                            type="number" 
                            value={liqInputs.eth} 
                            onChange={(e)=>handleLiquidityCalc('eth', e.target.value)}
                        />
                    </div>
                    <label>{tokenSymbol}</label>
                    <div className="input-group">
                        <input 
                            type="number" 
                            value={liqInputs.token} 
                            onChange={(e)=>handleLiquidityCalc('token', e.target.value)}
                        />
                    </div>
                    <button className="btn-lock mt-20" onClick={handleAddLiq}>ADD +</button>
                </div>
                <div className="liquidity-card">
                    <h3>Tarik Likuiditas</h3>
                    <label>Jumlah LP</label>
                    <div className="input-group">
                        <input 
                            type="number" 
                            value={liqInputs.removeLiqLp} 
                            onChange={(e)=>setLiqInputs({...liqInputs, removeLiqLp: e.target.value})}
                        />
                    </div>
                    <button className="btn-burn mt-20" onClick={handleRemoveLiq}>REMOVE -</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}