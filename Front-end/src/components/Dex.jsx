import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

import SwapTokenABI from '../abis/SwapToken.json';
import MRTABI from '../abis/MRT.json';
import wMRTABI from '../abis/wMRT.json';

export default function Dex() {
  const { account, chainId, provider } = useWeb3();
  const chainIdNum = Number(chainId);

  const [activeTab, setActiveTab] = useState('swap'); 
  const [status, setStatus] = useState("");

  const [poolData, setPoolData] = useState({
    ethReserve: "0",
    tokenReserve: "0",
    price: "0",
    lpBalance: "0"
  });

  const [buyInputEth, setBuyInputEth] = useState("");       
  const [buyOutputToken, setBuyOutputToken] = useState(""); 
  const [sellInputToken, setSellInputToken] = useState(""); 
  const [sellOutputEth, setSellOutputEth] = useState("");   

  const [liqInputs, setLiqInputs] = useState({
    eth: "",
    token: "",
    removeLiqLp: ""
  });

  // ================= SAFE SIGNER =================
  const getFreshSigner = async () => {
    if (!provider) throw new Error("Wallet belum terhubung");
    return await provider.getSigner();
  };

  // ================= NETWORK CONFIG =================
  const getCurrentNetworkConfig = () => {
    if (chainIdNum === Number(CONFIG.NETWORKS.SEPOLIA.CHAIN_ID))
      return { name: 'Sepolia', symbol: 'MRT', color: 'var(--primary)', dex: CONFIG.CONTRACTS.SEPOLIA.DEX, token: CONFIG.CONTRACTS.SEPOLIA.TOKEN, abi: MRTABI, rpc: CONFIG.NETWORKS.SEPOLIA.RPC_URL };

    if (chainIdNum === Number(CONFIG.NETWORKS.HOODI.CHAIN_ID))
      return { name: 'Hoodi', symbol: 'wMRT', color: 'var(--secondary)', dex: CONFIG.CONTRACTS.HOODI.DEX, token: CONFIG.CONTRACTS.HOODI.WMRT, abi: wMRTABI, rpc: CONFIG.NETWORKS.HOODI.RPC_URL };

    if (chainIdNum === Number(CONFIG.NETWORKS.BASE.CHAIN_ID))
      return { name: 'Base Sepolia', symbol: 'wMRT', color: 'var(--blue)', dex: CONFIG.CONTRACTS.BASE.DEX, token: CONFIG.CONTRACTS.BASE.WMRT, abi: wMRTABI, rpc: CONFIG.NETWORKS.BASE.RPC_URL };

    if (chainIdNum === Number(CONFIG.NETWORKS.OPTIMISM.CHAIN_ID))
      return { name: 'OP Sepolia', symbol: 'wMRT', color: 'var(--red)', dex: CONFIG.CONTRACTS.OPTIMISM.DEX, token: CONFIG.CONTRACTS.OPTIMISM.WMRT, abi: wMRTABI, rpc: CONFIG.NETWORKS.OPTIMISM.RPC_URL };

    if (chainIdNum === Number(CONFIG.NETWORKS.ARBITRUM.CHAIN_ID))
      return { name: 'Arbitrum Sepolia', symbol: 'wMRT', color: 'var(--indigo)', dex: CONFIG.CONTRACTS.ARBITRUM.DEX, token: CONFIG.CONTRACTS.ARBITRUM.WMRT, abi: wMRTABI, rpc: CONFIG.NETWORKS.ARBITRUM.RPC_URL };

    return null;
  };

  const currentNet = getCurrentNetworkConfig();

  // ================= UPDATE POOL =================
  const updatePoolData = async () => {
    if (!account || !currentNet) return;

    try {
      const rpcProvider = new ethers.JsonRpcProvider(currentNet.rpc);
      const dex = new ethers.Contract(currentNet.dex, SwapTokenABI, rpcProvider);

      const [tokenRes, ethRes] = await dex.getReserves();
      const token = Number(ethers.formatEther(tokenRes));
      const eth = Number(ethers.formatEther(ethRes));
      const price = eth > 0 ? token / eth : 0;

      const lpBal = await dex.balanceOf(account);

      setPoolData({
        ethReserve: eth.toFixed(4),
        tokenReserve: token.toFixed(2),
        price,
        lpBalance: Number(ethers.formatEther(lpBal)).toFixed(4)
      });
    } catch (e) {
      console.error("Pool fetch error:", e);
    }
  };

  useEffect(() => {
    updatePoolData();
    const i = setInterval(updatePoolData, 10000);
    return () => clearInterval(i);
  }, [account, chainIdNum]);
  
  // --- LOGIKA HITUNG ESTIMASI ---
  const handleBuyInput = (val) => {
    setBuyInputEth(val);
    if (!val || isNaN(val) || parseFloat(poolData.price) === 0) {
        setBuyOutputToken(""); return;
    }
    const est = parseFloat(val) * parseFloat(poolData.price);
    setBuyOutputToken(est.toFixed(4));
  };

  const handleSellInput = (val) => {
    setSellInputToken(val);
    if (!val || isNaN(val) || parseFloat(poolData.price) === 0) {
        setSellOutputEth(""); return;
    }
    const est = parseFloat(val) / parseFloat(poolData.price);
    setSellOutputEth(est.toFixed(6));
  };

  // --- HANDLERS ---
  const executeSwapEthToToken = async () => {
    setStatus(`⏳ Swapping ETH -> ${currentNet.symbol}...`);
    try {
        const signer = await getFreshSigner();
        const dex = new ethers.Contract(currentNet.dex, SwapTokenABI, signer);
        const amountIn = ethers.parseEther(buyInputEth);
        
        const tx = await dex.swapEthToToken(0, { value: amountIn });
        await tx.wait();
        
        setStatus("✅ Swap Berhasil!");
        setBuyInputEth(""); setBuyOutputToken("");
        setTimeout(updatePoolData, 2000);
    } catch (err) { setStatus("❌ Gagal: " + (err.reason || err.message)); }
  };

  const executeSwapTokenToEth = async () => {
    setStatus(`⏳ Swapping ${currentNet.symbol} -> ETH...`);
    try {
        const signer = await getFreshSigner();
        const dex = new ethers.Contract(currentNet.dex, SwapTokenABI, signer);
        const token = new ethers.Contract(currentNet.token, currentNet.abi, signer);
        const amountIn = ethers.parseEther(sellInputToken);

        setStatus(`1/2: Approve ${currentNet.symbol}...`);
        await (await token.approve(currentNet.dex, amountIn)).wait();

        setStatus("2/2: Executing Swap...");
        await (await dex.swapTokenToEth(amountIn, 0)).wait();

        setStatus("✅ Swap Berhasil!");
        setSellInputToken(""); setSellOutputEth("");
        setTimeout(updatePoolData, 2000);
    } catch (err) { setStatus("❌ Gagal: " + (err.reason || err.message)); }
  };

  // --- LIQUIDITY HANDLERS ---
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
        const signer = await getFreshSigner();
        const dex = new ethers.Contract(currentNet.dex, SwapTokenABI, signer);
        const token = new ethers.Contract(currentNet.token, currentNet.abi, signer);

        const ethWei = ethers.parseEther(liqInputs.eth);
        const tokenWei = ethers.parseEther(liqInputs.token);

        setStatus(`1/2: Approve ${currentNet.symbol}...`);
        await (await token.approve(currentNet.dex, tokenWei)).wait();

        setStatus("2/2: Deposit Pair...");
        await (await dex.addLiquidity(tokenWei, { value: ethWei })).wait();

        setStatus("✅ Likuiditas Ditambahkan!");
        setLiqInputs({ eth: "", token: "", lp: "" });
        setTimeout(updatePoolData, 2000);
    } catch (err) { setStatus("❌ Gagal: " + (err.reason || err.message)); }
  };

  const handleRemoveLiq = async () => {
      setStatus("⏳ Menarik Likuiditas...");
      try {
          const signer = await getFreshSigner();
          const dex = new ethers.Contract(currentNet.dex, SwapTokenABI, signer);
          const lpWei = ethers.parseEther(liqInputs.removeLiqLp);
          await (await dex.removeLiquidity(lpWei, 0, 0)).wait();
          setStatus("✅ Likuiditas Ditarik!");
          setLiqInputs(prev => ({ ...prev, removeLiqLp: "" }));
          setTimeout(updatePoolData, 2000);
      } catch (err) { setStatus("❌ Gagal: " + err.message); }
  };

  // --- RENDER ---

  if (!currentNet) {
    return (
        <div className="access-denied">
            <p>⚠️ Jaringan Tidak Didukung</p>
            <p>Silakan pindah ke Sepolia, Hoodi, Base, Optimism, atau Arbitrum.</p>
        </div>
    );
  }
  
  const buttonStyle = {
      backgroundColor: currentNet.color,
      color: '#000', // Teks hitam agar kontras
      marginTop: '20px',
      width: '100%',
      padding: '12px',
      border: 'none',
      fontWeight: 'bold',
      borderRadius: '4px',
      cursor: 'pointer'
  };

  return (
    <div className="dex-wrapper">
      {status && <div className="status-log">{status}</div>}

      {/* HEADER STATUS POOL (DYNAMIC COLOR) */}
      <div 
        className="terminal-card mb-20" 
        style={{ borderColor: currentNet.color, boxShadow: `0 0 15px ${currentNet.color}1a` }}
      >
        <div className="card-header">
             <h3 style={{ color: currentNet.color }}>
                POOL: ETH / {currentNet.symbol} ({currentNet.name})
             </h3>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span>ETH Reserve: <b>{poolData.ethReserve}</b></span>
            <span>{currentNet.symbol} Reserve: <b>{poolData.tokenReserve}</b></span>
            <span>Rate: <b>1 ETH ≈ {poolData.price} {currentNet.symbol}</b></span>
        </div>
      </div>

      {/* NAVIGASI TAB */}
      <div className="dex-tabs">
         <button 
            className={activeTab==='swap'?'active':''} 
            onClick={() => setActiveTab('swap')}
            style={activeTab === 'swap' ? { borderColor: currentNet.color, color: currentNet.color } : {}}
         >SWAP</button>
         <button 
            className={activeTab==='liquidity'?'active':''} 
            onClick={() => setActiveTab('liquidity')}
            style={activeTab === 'liquidity' ? { borderColor: currentNet.color, color: currentNet.color } : {}}
         >LIQUIDITY</button>
      </div>

      {/* TAB SWAP */}
      {activeTab === 'swap' && (
        <div className="bridge-grid">
            {/* KARTU BELI */}
            <div className="terminal-card">
                <h3>Beli {currentNet.symbol}</h3>
                <div className="input-group">
                    <label>Bayar (ETH)</label>
                    <input type="number" placeholder="0.0" value={buyInputEth} onChange={(e) => handleBuyInput(e.target.value)} />
                </div>
                <div className="input-group mt-10">
                    <label>Terima ({currentNet.symbol}) <small>Estimasi</small></label>
                    <input type="text" placeholder="0.0" readOnly value={buyOutputToken} />
                </div>
                <button style={buttonStyle} onClick={executeSwapEthToToken}>
                    SWAP ⬇️
                </button>
            </div>

            {/* KARTU JUAL */}
            <div className="terminal-card">
                <h3>Jual {currentNet.symbol}</h3>
                <div className="input-group">
                    <label>Bayar ({currentNet.symbol})</label>
                    <input type="number" placeholder="0.0" value={sellInputToken} onChange={(e) => handleSellInput(e.target.value)} />
                </div>
                <div className="input-group mt-10">
                    <label>Terima (ETH) <small>Estimasi</small></label>
                    <input type="text" placeholder="0.0" readOnly value={sellOutputEth} />
                </div>
                <button style={buttonStyle} onClick={executeSwapTokenToEth}>
                    APPROVE & SWAP ⬆️
                </button>
            </div>
        </div>
      )}

      {/* TAB LIQUIDITY */}
      {activeTab === 'liquidity' && (
        <div>
            <p style={{ textAlign: 'center', marginBottom: '20px' }}>
                Saldo LP Token: <b style={{ color: currentNet.color }}>{poolData.lpBalance} LP</b>
            </p>
            <div className="bridge-grid">
                <div className="liquidity-card">
                    <h3>Tambah Likuiditas</h3>
                    <div className="input-group">
                        <label>ETH</label>
                        <input type="number" value={liqInputs.eth} onChange={(e)=>handleLiquidityCalc('eth', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>{currentNet.symbol}</label>
                        <input type="number" value={liqInputs.token} onChange={(e)=>handleLiquidityCalc('token', e.target.value)} />
                    </div>
                    <button style={buttonStyle} onClick={handleAddLiq}>ADD +</button>
                </div>
                <div className="liquidity-card">
                    <h3>Tarik Likuiditas</h3>
                    <div className="input-group">
                        <label>Jumlah LP</label>
                        <input type="number" value={liqInputs.removeLiqLp} onChange={(e)=>setLiqInputs({...liqInputs, removeLiqLp: e.target.value})} />
                    </div>
                    <button style={buttonStyle} onClick={handleRemoveLiq}>REMOVE -</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}