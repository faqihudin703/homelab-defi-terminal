import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

import TokenVaultABI from '../abis/TokenVault.json';
import wMRTABI from '../abis/wMRT.json';
import MRTABI from '../abis/MRT.json';

export default function Bridge() {
  const { account, chainId, provider } = useWeb3();
  const chainIdNum = Number(chainId);

  // ================= STATE =================
  const [balances, setBalances] = useState({ 
    sepolia: { eth: "0", token: "0" },
    hoodi:   { eth: "0", token: "0" },
    base:    { eth: "0", token: "0" },
    optimism:{ eth: "0", token: "0" },
    arbitrum:{ eth: "0", token: "0" }
  });

  const [inputs, setInputs] = useState({
    lockAmount: "",
    burnAmount: "",
    transferRecipient: "",
    transferAmount: "",
    mintRecipient: "",
    mintAmount: ""
  });

  const [status, setStatus] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [destChainKey, setDestChainKey] = useState('HOODI');

  // ================= SAFE SIGNER =================
  const getFreshSigner = async () => {
    if (!provider) {
      throw new Error("Wallet belum terhubung");
    }
    return await provider.getSigner();
  };

  // ================= BALANCE UPDATE =================
  const updateBalances = async () => {
    if (!account) return;

    try {
      const fetchBal = async (rpc, tokenAddr, abi) => {
        const p = new ethers.JsonRpcProvider(rpc);
        const eth = Number(ethers.formatEther(await p.getBalance(account))).toFixed(4);
        const token = new ethers.Contract(tokenAddr, abi, p);
        const bal = ethers.formatEther(await token.balanceOf(account));
        return { eth, token: bal };
      };

      const [sep, hoo, bas, op, arb] = await Promise.all([
        fetchBal(CONFIG.NETWORKS.SEPOLIA.RPC_URL, CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI),
        fetchBal(CONFIG.NETWORKS.HOODI.RPC_URL, CONFIG.CONTRACTS.HOODI.WMRT, wMRTABI),
        fetchBal(CONFIG.NETWORKS.BASE.RPC_URL, CONFIG.CONTRACTS.BASE.WMRT, wMRTABI),
        fetchBal(CONFIG.NETWORKS.OPTIMISM.RPC_URL, CONFIG.CONTRACTS.OPTIMISM.WMRT, wMRTABI),
        fetchBal(CONFIG.NETWORKS.ARBITRUM.RPC_URL, CONFIG.CONTRACTS.ARBITRUM.WMRT, wMRTABI),
      ]);

      setBalances({ sepolia: sep, hoodi: hoo, base: bas, optimism: op, arbitrum: arb });
    } catch (e) {
      console.error("Balance update error:", e);
    }
  };

  // ================= OWNER CHECK =================
  const checkOwner = async () => {
    if (!account) return;

    try {
      const p = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
      const token = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, p);
      const role = await token.BRIDGE_ROLE();
      setIsOwner(await token.hasRole(role, account));
    } catch {
      setIsOwner(false);
    }
  };

  useEffect(() => {
    updateBalances();
    checkOwner();
    const i = setInterval(updateBalances, 15000);
    return () => clearInterval(i);
  }, [account, chainIdNum]);

  // ================= HELPERS =================
  const getCurrentChainKey = () => {
    if (chainIdNum === Number(CONFIG.NETWORKS.SEPOLIA.CHAIN_ID)) return 'SEPOLIA';
    if (chainIdNum === Number(CONFIG.NETWORKS.HOODI.CHAIN_ID)) return 'HOODI';
    if (chainIdNum === Number(CONFIG.NETWORKS.BASE.CHAIN_ID)) return 'BASE';
    if (chainIdNum === Number(CONFIG.NETWORKS.OPTIMISM.CHAIN_ID)) return 'OPTIMISM';
    if (chainIdNum === Number(CONFIG.NETWORKS.ARBITRUM.CHAIN_ID)) return 'ARBITRUM';
    return null;
  };

  // ================= LOCK =================
  const handleLock = async () => {
    if (chainIdNum !== Number(CONFIG.NETWORKS.SEPOLIA.CHAIN_ID))
      return alert("Ganti network ke Sepolia!");

    try {
      setStatus(`⏳ Locking to ${destChainKey}...`);
      const signer = await getFreshSigner();

      const token = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, signer);
      const vault = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.VAULT, TokenVaultABI, signer);
      const amt = ethers.parseEther(inputs.lockAmount);

      await (await token.approve(CONFIG.CONTRACTS.SEPOLIA.VAULT, amt)).wait();

      const target = CONFIG.NETWORKS[destChainKey];
      const tx = await vault.lockTo(
        account,
        amt,
        Number(target.CHAIN_ID),
        CONFIG.CONTRACTS[destChainKey].WMRT
      );

      await tx.wait();
      setInputs(p => ({ ...p, lockAmount: "" }));
      setStatus("✅ Lock berhasil!");
      updateBalances();
    } catch (e) {
      setStatus("❌ " + e.message);
    }
  };

  // ================= BURN =================
  const handleBurn = async () => {
    const currentKey = getCurrentChainKey();
    if (!currentKey || currentKey === 'SEPOLIA')
      return alert("Pindah ke L2 terlebih dahulu!");

    try {
      setStatus(`⏳ Burning on ${currentKey}...`);
      const signer = await getFreshSigner();
      const wmrt = new ethers.Contract(CONFIG.CONTRACTS[currentKey].WMRT, wMRTABI, signer);
      const amt = ethers.parseEther(inputs.burnAmount);

      // 🔐 SAFE ID (NONCE BASED)
      const nonce = await signer.getNonce();
      const burnId = ethers.id(`${account}-${nonce}`);

      await (await wmrt.burnForBridge(amt, burnId)).wait();
      setInputs(p => ({ ...p, burnAmount: "" }));
      setStatus("✅ Burn berhasil!");
      updateBalances();
    } catch (e) {
      setStatus("❌ " + e.message);
    }
  };

  const handleTransfer = async () => {
    setStatus("⏳ Mengirim Token...");
    
    try {
        // 1. Identifikasi Token & ABI berdasarkan Chain Aktif
        let tokenAddress, tokenABI;
        let currentNetworkName = "Unknown";

        switch (String(chainId)) {
            case CONFIG.NETWORKS.SEPOLIA.CHAIN_ID:
                tokenAddress = CONFIG.CONTRACTS.SEPOLIA.TOKEN;
                tokenABI = MRTABI;
                currentNetworkName = "Sepolia";
                break;
            case CONFIG.NETWORKS.HOODI.CHAIN_ID:
                tokenAddress = CONFIG.CONTRACTS.HOODI.WMRT;
                tokenABI = wMRTABI;
                currentNetworkName = "Hoodi";
                break;
            case CONFIG.NETWORKS.BASE.CHAIN_ID:
                tokenAddress = CONFIG.CONTRACTS.BASE.WMRT;
                tokenABI = wMRTABI;
                currentNetworkName = "Base";
                break;
            case CONFIG.NETWORKS.OPTIMISM.CHAIN_ID:
                tokenAddress = CONFIG.CONTRACTS.OPTIMISM.WMRT;
                tokenABI = wMRTABI;
                currentNetworkName = "Optimism";
                break;
            case CONFIG.NETWORKS.ARBITRUM.CHAIN_ID:
                tokenAddress = CONFIG.CONTRACTS.ARBITRUM.WMRT;
                tokenABI = wMRTABI;
                currentNetworkName = "Arbitrum";
                break;
            default:
                throw new Error("Network tidak didukung untuk transfer.");
        }

        // 2. Validasi Input
        if (!ethers.isAddress(inputs.transferRecipient)) throw new Error("Alamat penerima tidak valid");
        if (!inputs.transferAmount) throw new Error("Masukkan jumlah");

        // 3. Eksekusi Transfer
        const signer = await getFreshSigner();
        const tokenContract = new ethers.Contract(tokenAddress, tokenABI, signer);
        const amountWei = ethers.parseEther(inputs.transferAmount);

        setStatus(`⏳ Mengirim ${inputs.transferAmount} di ${currentNetworkName}...`);
        
        const tx = await tokenContract.transfer(inputs.transferRecipient, amountWei);
        await tx.wait();

        setStatus(`✅ Transfer Berhasil di ${currentNetworkName}!`);
        updateBalances();
        setInputs(prev => ({ ...prev, transferRecipient: "", transferAmount: "" }));

    } catch (err) {
        console.error(err);
        setStatus("❌ Gagal: " + (err.reason || err.message));
    }
  };

  const handleMint = async () => {
      setStatus("⏳ Admin: Memproses  Minting...");
      try {
          const freshSigner = await getFreshSigner();
          const token = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, freshSigner);
          const recipient = inputs.mintRecipient || account;
          const amount = ethers.parseEther(inputs.mintAmount);
          
          const tx = await token.mint(recipient, amount);
          setStatus("⏳ Menunggu konfirmasi blok...");
          await tx.wait();
          setInputs(prev => ({ ...prev, mintAmount: "", mintRecipient: "" }));
          setStatus("✅ Sukses! Token berhasil dicetak.");
          updateBalances();
      } catch (err) {
          setStatus("❌ Gagal: " + err.message);
      }
  };


  // ============================================================
  // RENDER UI
  // ============================================================
  return (
    <div className="bridge-container">
        {status && <div className="status-log">{status}</div>}

        <div className="bridge-grid">
            
            {/* === KARTU 1: SEPOLIA (ORIGIN) === */}
            <div className={`terminal-card ${chainId === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID ? 'active-sepolia' : 'inactive'}`}>
                <div className="card-header"><h3 className="text-green">Jaringan Sepolia</h3></div>
                <div className="balance-row"><span>ETH:</span> <span>{balances.sepolia.eth}</span></div>
                <div className="balance-row"><span>MRT:</span> <span className="text-green">{balances.sepolia.token}</span></div>

                <div className="input-group mt-20">
                    <label>DESTINATION CHAIN</label>
                    <select 
                        value={destChainKey}
                        onChange={(e) => setDestChainKey(e.target.value)}
                        className={`terminal-select select-${destChainKey.toLowerCase()}`}
                        style={{ 
                            // Ubah warna teks dropdown sesuai pilihan
                            color: destChainKey === 'HOODI' ? 'var(--secondary)' :
                                   destChainKey === 'BASE' ? 'var(--blue)' :
                                   destChainKey === 'OPTIMISM' ? 'var(--red)' :
                                   destChainKey === 'ARBITRUM' ? 'var(--indigo)' : 'white',
                            fontWeight: 'bold'
                        }}
                    >
                        <option value="HOODI">Hoodi Testnet</option>
                        <option value="BASE">Base Sepolia Testnet</option>
                        <option value="OPTIMISM">Optimism Sepolia Testnet</option>
                        <option value="ARBITRUM">Arbitrum Sepolia Testnet</option>
                    </select>
                 </div>

                <div className="mt-20">
                    <input type="text" placeholder="Jumlah Lock" value={inputs.lockAmount} onChange={(e)=>setInputs({...inputs, lockAmount:e.target.value})} />
                    <button className="btn-lock" onClick={handleLock} disabled={chainId !== CONFIG.NETWORKS.SEPOLIA.CHAIN_ID}
                        style={{ 
                            background: 
                                destChainKey === 'HOODI' ? 'var(--secondary)' :
                                destChainKey === 'BASE' ? 'var(--blue)' :
                                destChainKey === 'OPTIMISM' ? 'var(--red)' :
                                destChainKey === 'ARBITRUM' ? 'var(--indigo)' : 'var(--primary)',
                            color: 'black'
                        }} 
                    >
                        LOCK TO {destChainKey} 🔒
                    </button>
                </div>
            </div>

            {/* === KARTU 2: DYNAMIC DESTINATION === */}
            {/* Logic: Jika user connect L2, tampilkan L2 itu. Jika di Sepolia, tampilkan DestChainKey yang dipilih */}
            {(() => {
                const currentKey = getCurrentChainKey();
                // Jika di L2, pakai L2 itu. Jika di Sepolia/Unknown, pakai Pilihan User.
                const viewKey = (currentKey && currentKey !== 'SEPOLIA') ? currentKey : destChainKey;
                
                const colorClass = getChainColorClass(viewKey);
                const activeClass = (currentKey === viewKey) ? getCardActiveClass(viewKey) : 'inactive';
                const data = balances[viewKey.toLowerCase()]; // Ambil saldo dari state
                const name = CONFIG.NETWORKS[viewKey].NAME;
                
                const btnColor = {
                    'SEPOLIA': 'var(--primary)',
                    'HOODI': 'var(--secondary)',
                    'BASE': 'var(--blue)',
                    'OPTIMISM': 'var(--red)',
                    'ARBITRUM': 'var(--indigo)'
                }[currentKey] || '#333';

                return (
                    <div className={`terminal-card ${activeClass}`}>
                        <div className="card-header"><h3 className={colorClass}>{name}</h3></div>
                        <div className="balance-row"><span>ETH:</span> <span>{data.eth}</span></div>
                        <div className="balance-row"><span>wMRT:</span> <span className={colorClass}>{data.token}</span></div>

                        <div className="mt-20">
                            <input type="text" placeholder="Jumlah Burn" value={inputs.burnAmount} onChange={(e)=>setInputs({...inputs, burnAmount:e.target.value})}
                            onFocus={(e) => e.target.style.borderColor = btnColor} onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}/>
                            <button className="btn-burn" onClick={handleBurn} disabled={currentKey !== viewKey}
                                style={{ 
                                    backgroundColor: btnColor, 
                                    color: '#000', // Teks hitam agar kontras
                                    marginTop: '15px',
                                    width: '100%',
                                    padding: '12px',
                                    border: 'none',
                                    fontWeight: 'bold',
                                    borderRadius: '4px',
                                    cursor: currentKey !== viewKey ? 'not-allowed' : 'pointer',
                                    opacity: currentKey !== viewKey ? 0.5 : 1
                                }} >
                                BURN & RETURN 🔥
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
        
        {/* --- PANEL TRANSFER P2P (RE-USE EXISTING HELPERS) --- */}
         {(() => {
             // 1. Ambil Key Jaringan Aktif (SEPOLIA, HOODI, BASE, dll)
             // Jika null (unsupported network), default ke SEPOLIA agar tidak error render
             const currentKey = getCurrentChainKey() || 'SEPOLIA';
             
             // 2. Gunakan Helper yang SUDAH ADA untuk Class CSS
             const cardClass = getCardActiveClass(currentKey); // misal: 'active-base'
             const textClass = getChainColorClass(currentKey); // misal: 'text-blue'
             const netName = CONFIG.NETWORKS[currentKey]?.NAME || 'Unknown';

             // 3. Mapping warna background tombol manual (karena helper css cuma return class text)
             const btnBgColor = {
                 'SEPOLIA': 'var(--primary)',
                 'HOODI': 'var(--secondary)',
                 'BASE': 'var(--blue)',
                 'OPTIMISM': 'var(--red)',
                 'ARBITRUM': 'var(--indigo)'
             }[currentKey] || '#333';

             return (
                 <div className={`terminal-card mt-20 ${cardClass}`}>
                     <div className="card-header">
                         <h3 className={textClass}>
                             Transfer P2P 
                             <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '10px', textTransform: 'none' }}>
                                 via {netName}
                             </span>
                         </h3>
                     </div>
                     
                     <div className="input-group">
                        <label>Alamat Penerima (0x...)</label>
                        <input 
                            type="text" 
                            placeholder="0x..." 
                            value={inputs.transferRecipient} 
                            onChange={(e)=>setInputs({...inputs, transferRecipient:e.target.value})} 
                            // Fokus border mengikuti warna jaringan
                            style={{ borderColor: inputs.transferRecipient ? btnBgColor : '' }}
                        />
                     </div>

                     <div className="input-group">
                        <label>Jumlah ({currentKey === 'SEPOLIA' ? 'MRT' : 'wMRT'})</label>
                        <input 
                            type="number" 
                            placeholder="0.0" 
                            value={inputs.transferAmount} 
                            onChange={(e)=>setInputs({...inputs, transferAmount:e.target.value})} 
                            style={{ borderColor: inputs.transferAmount ? btnBgColor : '' }}
                        />
                     </div>
                     
                     <button 
                        className="btn-transfer" 
                        onClick={handleTransfer}
                        style={{ 
                            backgroundColor: btnBgColor,
                            color: '#000' // Teks hitam agar kontras
                        }}
                     >
                        Kirim Token 💸
                     </button>
                 </div>
             );
         })()}
      
      {isOwner && chainId === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID && (
             <div className="terminal-card mt-20" style={{borderColor: 'var(--secondary)'}}>
                 <h3 style={{color: 'var(--secondary)'}}>👑 ADMIN MINT</h3>
                 <input type="text" placeholder="Penerima" value={inputs.mintRecipient} onChange={(e)=>setInputs({...inputs, mintRecipient:e.target.value})} />
                 <input type="text" placeholder="Jumlah" value={inputs.mintAmount} onChange={(e)=>setInputs({...inputs, mintAmount:e.target.value})} />
                 <button onClick={handleMint} style={{background: 'var(--secondary)', color: 'black', border:'none'}}>MINT TOKEN ⚡</button>
             </div>
         )}
    </div>
  );
}