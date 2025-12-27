import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

// Import Komponen
import MintNFT from './MintNFT';
import ManageNFT from './ManageNFT';

// Import ABI
import NFTABI from '../abis/NFTHomelab.json';
import VaultABI from '../abis/NFTVault.json';
import WrappedABI from '../abis/WrappedNFT.json';

export default function NftTerminal() {
  const { account, chainId, provider } = useWeb3();
  
  const [activeTab, setActiveTab] = useState('mint');
  const [status, setStatus] = useState("");
  
  const [bridgeId, setBridgeId] = useState("");
  const [destChainKey, setDestChainKey] = useState("HOODI");
  
  const [isOwner, setIsOwner] = useState(false);
  const [contractBalance, setContractBalance] = useState("0");

  // --- 1. KONFIGURASI DINAMIS (WARNA & NAMA) ---
  const getCurrentNetworkConfig = () => {
      const chainIdNum = Number(chainId);
      if (chainIdNum === CONFIG.NETWORKS.SEPOLIA.CHAIN_ID) return { type: 'SEPOLIA', name: 'Sepolia', color: 'var(--primary)' };
      if (chainIdNum === CONFIG.NETWORKS.HOODI.CHAIN_ID) return { type: 'HOODI', name: 'Hoodi', color: 'var(--secondary)' };
      if (chainIdNum === CONFIG.NETWORKS.BASE.CHAIN_ID) return { type: 'BASE', name: 'Base Sepolia', color: 'var(--blue)' };
      if (chainIdNum === CONFIG.NETWORKS.OPTIMISM.CHAIN_ID) return { type: 'OPTIMISM', name: 'OP Sepolia', color: 'var(--red)' };
      if (chainIdNum === CONFIG.NETWORKS.ARBITRUM.CHAIN_ID) return { type: 'ARBITRUM', name: 'Arbitrum Sepolia', color: 'var(--indigo)' };
      return null;
  };

  const currentNet = getCurrentNetworkConfig();
  const isSepolia = currentNet?.type === 'SEPOLIA';
  const isL2 = currentNet && !isSepolia;

  // Helper Warna untuk Tombol LOCK (Berdasarkan Tujuan)
  const getDestColor = () => {
      if (destChainKey === 'HOODI') return 'var(--secondary)';
      if (destChainKey === 'BASE') return 'var(--blue)';
      if (destChainKey === 'OPTIMISM') return 'var(--red)';
      if (destChainKey === 'ARBITRUM') return 'var(--indigo)';
      return 'var(--primary)';
  };

  const getFreshSigner = async () => {
      if (!provider) throw new Error("Wallet belum terhubung");
      return await provider.getSigner();
  };
  
  useEffect(() => {
    const checkOwnerAndBalance = async () => {
        if (!isSepolia || !account) return;
        try {
            // Gunakan Provider Read-Only agar tidak popup metamask
            const provider = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
            const nftContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT, NFTABI, provider);
            
            // Cek Owner
            try {
                const owner = await nftContract.owner();
                if (owner.toLowerCase() === account.toLowerCase()) {
                    setIsOwner(true);
                    // Cek Saldo (Profit)
                    const bal = await provider.getBalance(CONFIG.CONTRACTS.SEPOLIA.NFT);
                    setContractBalance(ethers.formatEther(bal));
                } else {
                    setIsOwner(false);
                }
            } catch(e) { setIsOwner(false); }

        } catch (e) { console.error("Error check owner:", e); }
    };
    checkOwnerAndBalance();
  }, [account, chainId]);
  
  const handleWithdraw = async () => {
      setStatus("⏳ Menarik profit...");
      try {
          const signer = await getFreshSigner();
          const nftContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT, NFTABI, signer);
          
          const tx = await nftContract.withdraw();
          await tx.wait();
          
          setStatus("✅ Profit berhasil ditarik ke dompet Anda!");
          setContractBalance("0");
      } catch(e) { setStatus("❌ Gagal Withdraw: " + e.message); }
  };

  // --- LOGIKA BRIDGE (LOCK) ---
  const handleLock = async () => {
    if (!bridgeId) return alert("Isi ID!");
    setStatus("⏳ Memproses Bridge...");
    try {
        const signer = await getFreshSigner();
        const nftContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT, NFTABI, signer);
        const vaultContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT_VAULT, VaultABI, signer);
        
        // 1. Approve
        setStatus("1/2: Cek Approval...");
        const approved = await nftContract.getApproved(bridgeId).catch(()=>ethers.ZeroAddress);
        const isAllApproved = await nftContract.isApprovedForAll(account, CONFIG.CONTRACTS.SEPOLIA.NFT_VAULT);

        if (approved.toLowerCase() !== CONFIG.CONTRACTS.SEPOLIA.NFT_VAULT.toLowerCase() && !isAllApproved) {
            setStatus("1/2: Mengirim Approval...");
            await (await nftContract.approve(CONFIG.CONTRACTS.SEPOLIA.NFT_VAULT, bridgeId)).wait();
        }

        // 2. Lock
        const targetChainId = CONFIG.NETWORKS[destChainKey].CHAIN_ID;
        setStatus(`2/2: Mengunci ke ${destChainKey}...`);
        
        await (await vaultContract.lockNFT(CONFIG.CONTRACTS.SEPOLIA.NFT, bridgeId, targetChainId, account)).wait();

        setStatus("✅ NFT Terkirim! Relayer sedang memproses.");
        setBridgeId("");
    } catch (e) { setStatus("❌ Gagal: " + e.message); }
  };

  // --- LOGIKA WITHDRAW (BURN) ---
  const handleBurn = async () => {
    if (!bridgeId) return alert("Isi ID!");
    setStatus("⏳ Mengembalikan ke Sepolia...");
    try {
        const signer = await getFreshSigner();
        let wNftAddr;
        
        // Ambil alamat sesuai chain aktif
        if (currentNet.type === 'HOODI') wNftAddr = CONFIG.CONTRACTS.HOODI.WNFT;
        else if (currentNet.type === 'BASE') wNftAddr = CONFIG.CONTRACTS.BASE.WNFT;
        else if (currentNet.type === 'OPTIMISM') wNftAddr = CONFIG.CONTRACTS.OPTIMISM.WNFT;
        else if (currentNet.type === 'ARBITRUM') wNftAddr = CONFIG.CONTRACTS.ARBITRUM.WNFT;

        if (!wNftAddr) throw new Error("Kontrak NFT tidak ditemukan.");

        const wNft = new ethers.Contract(wNftAddr, WrappedABI, signer);
        const txId = ethers.id(Date.now().toString());
        
        await (await wNft.burnForBridge(bridgeId, txId)).wait();
        setStatus("✅ NFT Dikembalikan! Cek Sepolia.");
        setBridgeId("");
    } catch (e) { setStatus("❌ Gagal: " + e.message); }
  };

  // --- RENDER UI ---
  if (!currentNet) return <div className="access-denied"><p>Jaringan tidak didukung.</p></div>;

  // Style Tab Dinamis
  const tabStyle = (isActive) => ({
      borderColor: isActive ? currentNet.color : 'var(--border-color)',
      color: isActive ? currentNet.color : 'var(--text-muted)',
      background: isActive ? '#161b22' : 'transparent',
      boxShadow: isActive ? `0 0 10px ${currentNet.color}33` : 'none',
      cursor: 'pointer'
  });

  return (
    <div className="dex-wrapper">
        {status && <div className="status-log">{status}</div>}

        {/* HEADER STATUS (Warna Sesuai Chain) */}
        <div className="pool-stats-bar" style={{ borderColor: currentNet.color, borderLeft: `4px solid ${currentNet.color}` }}>
            <span>Protocol: <b>NFT OMNICHAIN</b></span>
            <span>Network: <b style={{color: currentNet.color}}>{currentNet.name}</b></span>
        </div>

        {/* TAB NAVIGASI */}
        <div className="dex-tabs">
            {isSepolia ? (
                <>
                    <button style={tabStyle(activeTab==='mint')} onClick={()=>setActiveTab('mint')}>MINT</button>
                    <button style={tabStyle(activeTab==='manage')} onClick={()=>setActiveTab('manage')}>MANAGE</button>
                    <button style={tabStyle(activeTab==='bridge')} onClick={()=>setActiveTab('bridge')}>BRIDGE</button>
                </>
            ) : (
                <>
                    <button style={tabStyle(activeTab==='withdraw')} onClick={()=>setActiveTab('withdraw')}>WITHDRAW</button>
                    <button style={tabStyle(activeTab==='manage')} onClick={()=>setActiveTab('manage')}>CHECK NFT</button>
                </>
            )}
        </div>

        {/* KONTEN 1: MINT (L1 Only) */}
        {isSepolia && activeTab === 'mint' && (
            <>
                <MintNFT onSuccess={()=>setStatus("Siap Bridge!")} />
                
                {/* --- ADMIN PANEL (RESTORED) --- */}
                {isOwner && (
                    <div className="admin-panel">
                        <h4 style={{color: 'var(--secondary)', margin:0, marginBottom:'10px'}}>👑 OWNER DASHBOARD</h4>
                        <p style={{fontSize:'0.9rem'}}>Pendapatan Minting: <b style={{color:'white', fontSize:'1.1rem'}}>{contractBalance} ETH</b></p>
                        <button 
                            className="btn-burn mt-20" 
                            onClick={handleWithdraw}
                            disabled={parseFloat(contractBalance) === 0}
                            style={{width: 'auto', padding: '8px 20px', background: parseFloat(contractBalance) > 0 ? 'var(--secondary)' : '#333', color:'black'}}
                        >
                            TARIK PROFIT 💰
                        </button>
                    </div>
                )}
            </>
        )}

        {/* KONTEN 2: MANAGE (L1 & L2) */}
        {activeTab === 'manage' && <ManageNFT />}

        {/* KONTEN 3: BRIDGE (L1 Only) - Tombol Lock Warna Warni */}
        {isSepolia && activeTab === 'bridge' && (
            <div className="terminal-card" style={{borderColor: getDestColor()}}>
                <div className="card-header">
                    <h3 style={{color: getDestColor()}}>KIRIM NFT KE L2</h3>
                </div>

                <div className="input-group">
                    <label>Token ID</label>
                    <input type="number" value={bridgeId} onChange={(e)=>setBridgeId(e.target.value)} style={{borderColor: getDestColor()}} />
                </div>
                
                <div className="input-group">
                    <label>Tujuan</label>
                    <select 
                        className={`terminal-select select-${destChainKey.toLowerCase()}`}
                        value={destChainKey}
                        onChange={(e) => setDestChainKey(e.target.value)}
                        style={{ 
                            color: getDestColor(), 
                            borderColor: getDestColor(),
                            fontWeight: 'bold' 
                        }}
                    >
                        <option value="HOODI">🟠 Hoodi</option>
                        <option value="BASE">🔵 Base</option>
                        <option value="OPTIMISM">🔴 Optimism</option>
                        <option value="ARBITRUM">🟣 Arbitrum</option>
                    </select>
                </div>

                <button 
                    className="btn-lock mt-20" 
                    onClick={handleLock}
                    style={{ backgroundColor: getDestColor(), color: '#000' }}
                >
                    LOCK & SEND TO {destChainKey} 🚀
                </button>
            </div>
        )}

        {/* KONTEN 4: WITHDRAW (L2 Only) - Warna Sesuai Chain Aktif */}
        {isL2 && activeTab === 'withdraw' && (
            <div className="terminal-card" style={{ borderColor: currentNet.color, boxShadow: `0 0 15px ${currentNet.color}1a` }}>
                <div className="card-header">
                    <h3 style={{color: currentNet.color}}>WITHDRAW KE SEPOLIA</h3>
                </div>
                <p style={{fontSize:'0.9rem', color: 'var(--text-muted)'}}>
                    Bakar NFT ini di <b>{currentNet.name}</b> untuk melepaskan aset asli.
                </p>

                <div className="input-group">
                    <label>Token ID (Wrapped)</label>
                    <input 
                        type="number" 
                        value={bridgeId} 
                        onChange={(e)=>setBridgeId(e.target.value)} 
                        onFocus={(e) => e.target.style.borderColor = currentNet.color}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                    />
                </div>
                
                <button 
                    className="btn-burn mt-20" 
                    onClick={handleBurn}
                    style={{ backgroundColor: currentNet.color, color: '#000' }}
                >
                    BURN & RETURN 🔥
                </button>
            </div>
        )}

    </div>
  );
}