import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

// ABI Imports
import TokenVaultABI from '../abis/TokenVault.json';
import wMRTABI from '../abis/wMRT.json';
import MRTABI from '../abis/MRT.json';

export default function Bridge() {
  const { account, chainId } = useWeb3();

  // State Data
  const [balances, setBalances] = useState({ 
    sepoliaEth: "0", sepoliaMrt: "0", 
    hoodiEth: "0", hoodiWmrt: "0",
    baseEth: "0", baseWmrt: "0" 
  });
  
  const [inputs, setInputs] = useState({ 
    lockAmount: "", burnAmount: "", 
    transferRecipient: "", transferAmount: "", 
    mintAmount: "", mintRecipient: "" 
  });
  
  const [status, setStatus] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  // --- STATE BARU: DESTINATION CHAIN ---
  // Default ke HOODI
  const [destChain, setDestChain] = useState('HOODI'); 

  // Helper: Mendapatkan Fresh Signer
  const getFreshSigner = async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask tidak ditemukan");
    }
        
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
        
    return signer; // selalu fresh & stabil di mobile
  };
  
  // --- UPDATE BALANCES (MULTI-CHAIN) ---
  const updateBalances = async () => {
    if (!account) return;
    try {
      // Provider Read-Only
      const pSepolia = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
      const pHoodi = new ethers.JsonRpcProvider(CONFIG.NETWORKS.HOODI.RPC_URL);
      const pBase = new ethers.JsonRpcProvider(CONFIG.NETWORKS.BASE.RPC_URL);

      // 1. SEPOLIA
      const ethSep = await pSepolia.getBalance(account);
      const mrtSep = await new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, pSepolia).balanceOf(account);

      // 2. HOODI
      const ethHoodi = await pHoodi.getBalance(account);
      const wmrtHoodi = await new ethers.Contract(CONFIG.CONTRACTS.HOODI.WMRT, wMRTABI, pHoodi).balanceOf(account);

      // 3. BASE
      const ethBase = await pBase.getBalance(account);
      const wmrtBase = await new ethers.Contract(CONFIG.CONTRACTS.BASE.WMRT, wMRTABI, pBase).balanceOf(account);

      setBalances({
        sepoliaEth: parseFloat(ethers.formatEther(ethSep)).toFixed(4),
        sepoliaMrt: ethers.formatEther(mrtSep),
        hoodiEth: parseFloat(ethers.formatEther(ethHoodi)).toFixed(4),
        hoodiWmrt: ethers.formatEther(wmrtHoodi),
        baseEth: parseFloat(ethers.formatEther(ethBase)).toFixed(4),
        baseWmrt: ethers.formatEther(wmrtBase),
      });
    } catch (err) { console.error("Balance update failed", err); }
  };
  
  const checkOwner = async () => {
    if (!account) return;

    try {
        const sepoliaProvider = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
        const tokenContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, sepoliaProvider);

        const bridgeRoleHash = await tokenContract.BRIDGE_ROLE();
        const isBridge = await tokenContract.hasRole(bridgeRoleHash, account);

        console.log("Has BRIDGE_ROLE?", isBridge);
        setIsOwner(isBridge);

    } catch (e) {
        console.error("Gagal cek BRIDGE_ROLE:", e);
        setIsOwner(false);
    }
  };

  useEffect(() => {
    updateBalances();
    checkOwner();
    const interval = setInterval(updateBalances, 10000);
    return () => clearInterval(interval);
  }, [account, chainId]);


  // ============================================================
  // HANDLER 1: LOCK (SEPOLIA -> HOODI / BASE)
  // ============================================================
  const handleLock = async () => {
    if (chainId !== CONFIG.NETWORKS.SEPOLIA.CHAIN_ID) return alert("Ganti network ke Sepolia!");
    
    setStatus(`⏳ Memproses Lock ke ${destChain}...`);
    try {
      const freshSigner = await getFreshSigner();
      const tokenContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, freshSigner);
      const vaultContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.VAULT, TokenVaultABI, freshSigner);
      
      const amountWei = ethers.parseEther(inputs.lockAmount);
      
      // 1. APPROVE
      setStatus("1/2: Menunggu Approval...");
      const txApp = await tokenContract.approve(CONFIG.CONTRACTS.SEPOLIA.VAULT, amountWei);
      await txApp.wait();
      
      // 2. TENTUKAN PARAMETER TUJUAN (V2)
      let targetChainId, targetTokenAddr;
      
      if (destChain === 'HOODI') {
          targetChainId = CONFIG.NETWORKS.HOODI.CHAIN_ID;
          targetTokenAddr = CONFIG.CONTRACTS.HOODI.WMRT;
      } else {
          targetChainId = CONFIG.NETWORKS.BASE.CHAIN_ID;
          targetTokenAddr = CONFIG.CONTRACTS.BASE.WMRT;
      }

      // 3. LOCK V2 (lockTo)
      setStatus(`2/2: Mengunci Token (Target: ${destChain})...`);
      
      // Signature: lockTo(recipient, amount, destChainId, destTokenAddr)
      const txLock = await vaultContract.lockTo(
          account,          // Penerima (diri sendiri)
          amountWei, 
          targetChainId,    // Chain ID Tujuan
          targetTokenAddr   // Alamat wMRT di Tujuan (untuk Relayer)
      );
      await txLock.wait();

      setStatus(`✅ Lock Berhasil! Relayer akan kirim ke ${destChain}.`);
      updateBalances();
      setInputs(prev => ({...prev, lockAmount: ""}));
    } catch (err) {
      setStatus("❌ Gagal: " + (err.reason || err.message));
    }
  };


  // ============================================================
  // HANDLER 2: BURN (HOODI/BASE -> SEPOLIA)
  // ============================================================
  const handleBurn = async () => {
    // Deteksi kita ada di chain mana
    let currentWmrtAddr;
    
    if (chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID) {
        currentWmrtAddr = CONFIG.CONTRACTS.HOODI.WMRT;
    } else if (chainId === CONFIG.NETWORKS.BASE.CHAIN_ID) {
        currentWmrtAddr = CONFIG.CONTRACTS.BASE.WMRT;
    } else {
        return alert("Ganti network ke Hoodi atau Base!");
    }

    setStatus("⏳ Memproses Burn...");
    try {
        const freshSigner = await getFreshSigner();
        const wmrtContract = new ethers.Contract(currentWmrtAddr, wMRTABI, freshSigner);
        const amountWei = ethers.parseEther(inputs.burnAmount);
        
        // Generate Transfer ID Unik
        const transferId = ethers.id(Date.now().toString());
        
        // Panggil fungsi burnForBridge
        const tx = await wmrtContract.burnForBridge(amountWei, transferId);
        await tx.wait();
        
        setStatus("✅ Burn Berhasil! Token akan dirilis di Sepolia.");
        updateBalances();
        setInputs(prev => ({...prev, burnAmount: ""}));
    } catch (err) {
        setStatus("❌ Gagal: " + (err.reason || err.message));
    }
  };

  const handleTransfer = async () => {
      setStatus("⏳ Mengirim Token...");
      
      try {
          // 1. Ambil Fresh Signer
          const freshSigner = await getFreshSigner();
          const amountWei = ethers.parseEther(inputs.transferAmount);
          let tx;
          
          // 2. Tentukan Kontrak Berdasarkan Chain Aktif
          if (chainId === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID) {
              // Transfer MRT (Sepolia)
              const token = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.TOKEN, MRTABI, freshSigner);
              tx = await token.transfer(inputs.transferRecipient, amountWei);
          
          } else if (chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID) {
              // Transfer wMRT (Hoodi)
              const token = new ethers.Contract(CONFIG.CONTRACTS.HOODI.WMRT, wMRTABI, freshSigner);
              tx = await token.transfer(inputs.transferRecipient, amountWei);
          
          } else if (chainId === CONFIG.NETWORKS.BASE.CHAIN_ID) {
              // Transfer wMRT (Base) <--- LOGIKA BARU
              const token = new ethers.Contract(CONFIG.CONTRACTS.BASE.WMRT, wMRTABI, freshSigner);
              tx = await token.transfer(inputs.transferRecipient, amountWei);
          
          } else {
              throw new Error("Network tidak dikenali. Pindah ke Sepolia, Hoodi, atau Base.");
          }

          // 3. Tunggu Konfirmasi
          await tx.wait();
          
          setStatus("✅ Transfer P2P Berhasil!");
          updateBalances();
          setInputs(prev => ({...prev, transferRecipient: "", transferAmount: ""}));

      } catch (err) {
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
             
             {/* --- KARTU 1: SEPOLIA (ORIGIN) --- */}
             <div className={`terminal-card ${chainId === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID ? 'active-sepolia' : 'inactive'}`}>
                 <div className="card-header">
                    <h3 className="text-green">Jaringan Sepolia Testnet</h3>
                 </div>
                 
                 {/* Saldo Info */}
                 <div className="balance-row"><span>ETH:</span> <span>{balances.sepoliaEth}</span></div>
                 <div className="balance-row"><span>MRT:</span> <span className="text-green">{balances.sepoliaMrt}</span></div>
                 
                 {/* PILIHAN TUJUAN (DESTINATION SELECTOR) */}
                 <div style={{ margin: '15px 0' }}>
                    <label style={{ fontSize: '0.8rem', color: '#8b949e', display: 'block', marginBottom: '5px' }}>DESTINATION CHAIN:</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            onClick={() => setDestChain('HOODI')}
                            style={{ 
                                flex: 1, 
                                border: destChain === 'HOODI' ? '1px solid var(--secondary)' : '1px solid #333',
                                color: destChain === 'HOODI' ? 'var(--secondary)' : '#666',
                                background: 'transparent'
                            }}
                        >
                            HOODI
                        </button>
                        <button 
                            onClick={() => setDestChain('BASE')}
                            style={{ 
                                flex: 1, 
                                border: destChain === 'BASE' ? '1px solid var(--blue)' : '1px solid #333',
                                color: destChain === 'BASE' ? 'var(--blue)' : '#666',
                                background: 'transparent'
                            }}
                        >
                            BASE
                        </button>
                    </div>
                 </div>

                 <div className="mt-20">
                    <input 
                        type="text" placeholder="Jumlah Lock" 
                        value={inputs.lockAmount} 
                        onChange={(e)=>setInputs({...inputs, lockAmount:e.target.value})} 
                    />
                    <button 
                        className="btn-lock" 
                        onClick={handleLock} 
                        disabled={chainId !== CONFIG.NETWORKS.SEPOLIA.CHAIN_ID}
                        style={{ background: destChain === 'BASE' ? 'var(--blue)' : 'var(--secondary)' }} // Warna beda untuk Base
                    >
                        Lock to {destChain} 🔒
                    </button>
                 </div>
             </div>

             {/* --- KARTU 2: DESTINATION (DYNAMIC HOODI / BASE) --- */}
             <div className={`terminal-card ${(chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID || chainId === CONFIG.NETWORKS.BASE.CHAIN_ID) ? 'active-hoodi' : 'inactive'}`}>
                 <div className="card-header">
                     <h3 className="text-orange">
                        {
                            chainId === CONFIG.NETWORKS.BASE.CHAIN_ID ? 'Jaringan Base Testnet' : 
                            chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID ? 'Jaringan Hoodi Testnet' :
                            (destChain === 'BASE' ? 'Jaringan Base Testnet' : 'Jaringan Hoodi Testnet')
                        }
                     </h3>
                 </div>
                 
                 {/* LOGIKA SALDO (Sama seperti judul) */}
                 <div className="balance-row">
                    <span>ETH:</span> 
                    <span>
                        {
                            chainId === CONFIG.NETWORKS.BASE.CHAIN_ID ? balances.baseEth : 
                            chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID ? balances.hoodiEth :
                            (destChain === 'BASE' ? balances.baseEth : balances.hoodiEth)
                        }
                    </span>
                 </div>
                 <div className="balance-row">
                    <span>wMRT:</span> 
                    <span className="text-orange">
                        {
                            chainId === CONFIG.NETWORKS.BASE.CHAIN_ID ? balances.baseWmrt : 
                            chainId === CONFIG.NETWORKS.HOODI.CHAIN_ID ? balances.hoodiWmrt :
                            (destChain === 'BASE' ? balances.baseWmrt : balances.hoodiWmrt)
                        }
                    </span>
                 </div>

                 <div className="mt-20">
                    <input type="text" placeholder="Jumlah Burn" value={inputs.burnAmount} onChange={(e)=>setInputs({...inputs, burnAmount:e.target.value})} />
                    <button 
                        className="btn-burn" 
                        onClick={handleBurn} 
                        disabled={chainId !== CONFIG.NETWORKS.HOODI.CHAIN_ID && chainId !== CONFIG.NETWORKS.BASE.CHAIN_ID}
                    >
                        Burn & Return 🔥
                    </button>
                 </div>
             </div>
         </div>

         {/* Transfer Panel */}
         <div className="terminal-card mt-20">
             <h3>Transfer P2P</h3>
             <input type="text" placeholder="Penerima" value={inputs.transferRecipient} onChange={(e)=>setInputs({...inputs, transferRecipient:e.target.value})} />
             <input type="text" placeholder="Jumlah" value={inputs.transferAmount} onChange={(e)=>setInputs({...inputs, transferAmount:e.target.value})} />
             <button className="btn-transfer" onClick={handleTransfer}>Kirim 💸</button>
         </div>

         {/* Admin Mint Panel */}
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