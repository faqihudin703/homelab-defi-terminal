import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

// Import ABI
import NFTABI from '../abis/NFTHomelab.json';      // Untuk L1
import WrappedABI from '../abis/WrappedNFT.json';  // Untuk L2

export default function ManageNFT() {
  const { account, chainId, provider } = useWeb3();
  const chainIdNum = Number(chainId);

  // ===== STATE =====
  const [tokenId, setTokenId] = useState("");
  const [nftData, setNftData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [preview, setPreview] = useState(null);

  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(false);
  const [limitInfo, setLimitInfo] = useState({
    used: 0,
    limit: 4,
    isLimitReached: false
  });

  // ===== NETWORK FLAGS =====
  const isSepolia = chainIdNum === Number(CONFIG.NETWORKS.SEPOLIA.CHAIN_ID);
  const isL2 = !isSepolia;

  // ===== SAFE RUNNER =====
  const getRunner = async (withSigner = false) => {
    if (withSigner) {
      if (!provider) throw new Error("Wallet belum terhubung");
      return await provider.getSigner();
    }
    return new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
  };

  // ===== GET CONTRACT =====
  const getContract = async (withSigner = false) => {
    const runner = await getRunner(withSigner);
    let address, abi;

    if (isSepolia) {
      address = CONFIG.CONTRACTS.SEPOLIA.NFT;
      abi = NFTABI;
    } else {
      if (chainIdNum === Number(CONFIG.NETWORKS.HOODI.CHAIN_ID))
        address = CONFIG.CONTRACTS.HOODI.WNFT;
      else if (chainIdNum === Number(CONFIG.NETWORKS.BASE.CHAIN_ID))
        address = CONFIG.CONTRACTS.BASE.WNFT;
      else if (chainIdNum === Number(CONFIG.NETWORKS.OPTIMISM.CHAIN_ID))
        address = CONFIG.CONTRACTS.OPTIMISM.WNFT;
      else if (chainIdNum === Number(CONFIG.NETWORKS.ARBITRUM.CHAIN_ID))
        address = CONFIG.CONTRACTS.ARBITRUM.WNFT;

      abi = WrappedABI;
    }

    if (!address) throw new Error("Kontrak NFT tidak ditemukan di jaringan ini.");
    return new ethers.Contract(address, abi, runner);
  };

  // ===== LIMIT CHECK (L1 ONLY) =====
  const checkLimit = async (id) => {
    if (!isSepolia || !CONFIG.WATCHER?.API_URL) return;
    try {
      const res = await axios.get(`${CONFIG.WATCHER.API_URL}/api/nft/limit/${id}`);
      setLimitInfo(res.data);
    } catch {
      setLimitInfo({ used: 0, limit: 4, isLimitReached: false });
    }
  };

  // ===== FETCH NFT =====
  const fetchNFT = async () => {
    if (!tokenId) return alert("Masukkan Token ID");
    if (!account) return alert("Wallet belum terhubung");

    setLoadingData(true);
    setNftData(null);
    setStatus("");
    setFile(null); setPreview(null); setName(""); setDesc("");

    try {
      const contract = await getContract(false);

      const owner = await contract.ownerOf(tokenId);
      if (owner.toLowerCase() !== account.toLowerCase()) {
        alert("Anda bukan pemilik NFT ini");
        return;
      }

      const uri = await contract.tokenURI(tokenId);
      const url = uri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
      const meta = await axios.get(url);

      setNftData({
        id: tokenId,
        name: meta.data.name,
        description: meta.data.description,
        image: meta.data.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/"),
        rawUri: uri
      });

      if (isSepolia) await checkLimit(tokenId);

    } catch (e) {
      console.error(e);
      alert("NFT tidak ditemukan / metadata error");
    } finally {
      setLoadingData(false);
    }
  };

  // ===== UPDATE METADATA (L1 ONLY) =====
  const handleUpdate = async () => {
    if (!isSepolia) return;
    if (limitInfo.isLimitReached) return alert("Kuota update habis");
    if (!file) return alert("Pilih gambar baru");

    setProcessing(true);
    try {
      setStatus("☁️ Upload ke IPFS...");

      const JWT = CONFIG.PINATA.JWT;
      const fd = new FormData();
      fd.append("file", file);

      const resImg = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        fd,
        { headers: { Authorization: `Bearer ${JWT}` } }
      );

      const metadata = JSON.stringify({
        pinataContent: {
          name: name || nftData.name,
          description: desc || nftData.description,
          image: `ipfs://${resImg.data.IpfsHash}`
        }
      });

      const resMeta = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        metadata,
        { headers: { Authorization: `Bearer ${JWT}` } }
      );

      setStatus("🔗 Update metadata on-chain...");
      const contract = await getContract(true);
      await (await contract.updateTokenURI(tokenId, `ipfs://${resMeta.data.IpfsHash}`)).wait();

      setStatus("✅ Metadata berhasil diupdate");
      setTimeout(fetchNFT, 3000);

    } catch (e) {
      setStatus("❌ Gagal: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  // ===== BURN NFT (L1 ONLY) =====
  const handleBurn = async () => {
    if (!isSepolia) return;
    if (!confirm("Yakin ingin menghapus NFT ini PERMANEN?")) return;

    setProcessing(true);
    setStatus("🔥 Membakar NFT...");
    try {
      const contract = await getContract(true);
      await (await contract.burn(tokenId)).wait();
      setStatus("✅ NFT berhasil dimusnahkan");
      setNftData(null);
    } catch (e) {
      setStatus("❌ Gagal: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  // --- RENDER UI ---
  return (
    <div className="terminal-card">
        <h3>MANAGE NFT <span className="badge-mode">{isSepolia ? "FULL ACCESS" : "READ ONLY"}</span></h3>
        
        {/* INPUT PENCARIAN */}
        <div className="input-group" style={{display:'flex', gap:'10px', marginTop:'15px'}}>
            <input 
                type="number" 
                placeholder="Token ID" 
                value={tokenId} 
                onChange={(e)=>setTokenId(e.target.value)} 
                style={{marginBottom:0}}
            />
            <button className="btn-transfer" style={{width:'auto'}} onClick={fetchNFT} disabled={loadingData}>
                {loadingData ? "..." : "CARI"}
            </button>
        </div>

        {nftData && (
            <div style={{marginTop: '20px', borderTop: '1px dashed #333', paddingTop: '20px'}}>
                
                {/* DETAIL TEKNIS (MUNCUL DI SEMUA CHAIN) */}
                <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.8rem', color: '#8b949e', border: '1px solid #333' }}>
                    <p style={{margin: '0 0 5px 0'}}><strong style={{color:'var(--text-main)'}}>Name:</strong> {nftData.name}</p>
                    <p style={{margin: '0 0 5px 0'}}><strong style={{color:'var(--text-main)'}}>URI:</strong> <span style={{fontFamily:'monospace'}}>{nftData.rawUri}</span></p>
                    <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                        <a href={nftData.rawUri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")} target="_blank" style={{color: 'var(--blue)', textDecoration: 'underline'}}>📄 Metadata JSON</a>
                        <span style={{color:'#333'}}>|</span>
                        <a href={nftData.image} target="_blank" style={{color: 'var(--blue)', textDecoration: 'underline'}}>🖼️ Gambar Asli</a>
                    </div>
                </div>

                {/* TAMPILAN GAMBAR */}
                <div style={{textAlign:'center', marginBottom:'20px'}}>
                    <img src={nftData.image} style={{maxWidth:'250px', borderRadius:'12px', border:'1px solid var(--border-color)', boxShadow:'0 5px 15px rgba(0,0,0,0.3)'}} alt="NFT" />
                </div>

                {/* --- LOGIKA TAMPILAN BERDASARKAN CHAIN --- */}
                
                {isL2 ? (
                    // === TAMPILAN L2 (READ ONLY) ===
                    <div style={{textAlign: 'center', padding: '15px', background: 'rgba(255, 165, 0, 0.1)', borderRadius: '8px', border:'1px solid var(--secondary)'}}>
                        <h4 style={{color: 'var(--secondary)', margin: '0 0 10px 0'}}>🔒 MODE READ-ONLY</h4>
                        <p style={{fontSize: '0.85rem', color: '#ccc', margin: 0}}>
                            Metadata dikunci di jaringan ini.<br/>
                            Untuk melakukan <b>Withdraw</b> atau <b>Transfer</b>, silakan gunakan menu di atas.
                        </p>
                    </div>
                ) : (
                    // === TAMPILAN L1 (FULL EDIT) ===
                    <>
                        {/* Indikator Limit */}
                        <div style={{textAlign:'right', marginBottom:'10px'}}>
                            <span style={{ color: limitInfo.isLimitReached ? '#ff3333' : 'var(--primary)', border: '1px solid #333', padding: '4px 8px', borderRadius: '4px', fontSize:'0.75rem' }}>
                                Kuota Update: {limitInfo.used}/{limitInfo.limit}
                            </span>
                        </div>

                        {/* Form Edit */}
                        <div className="input-group">
                            <label>Ganti Gambar</label>
                            {!preview ? (
                                <div className="upload-area" style={{padding:'15px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:0}}>
                                    <input type="file" accept="image/*" onChange={handleFileChange} className="file-input-hidden" />
                                    <span style={{fontSize:'1.5rem'}}>🔄 Klik Upload</span>
                                </div>
                            ) : (
                                <div style={{textAlign:'center'}}>
                                    <img src={preview} style={{maxWidth:'100px', borderRadius:'4px', border:'1px solid var(--primary)'}} />
                                    <button className="btn-burn" style={{padding:'2px 10px', fontSize:'0.7rem', marginTop:'5px'}} onClick={()=>setPreview(null)}>Batal</button>
                                </div>
                            )}
                        </div>

                        <div className="input-group">
                            <input type="text" placeholder={`Nama: ${nftData.name}`} value={name} onChange={e=>setName(e.target.value)} />
                        </div>
                        <div className="input-group">
                            <input type="text" placeholder={`Deskripsi: ${nftData.description}`} value={desc} onChange={e=>setDesc(e.target.value)} />
                        </div>

                        {status && <div className="status-log">{status}</div>}

                        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'10px'}}>
                            <button 
                                className="btn-lock" 
                                onClick={handleUpdate} 
                                disabled={processing || limitInfo.isLimitReached}
                                style={{ opacity: limitInfo.isLimitReached ? 0.5 : 1 }}
                            >
                                {limitInfo.isLimitReached ? "KUOTA HABIS" : "UPDATE 💾"}
                            </button>
                            <button className="btn-burn" onClick={handleBurn} disabled={processing} style={{background:'var(--danger)'}}>
                                MUSNAHKAN 🔥
                            </button>
                        </div>
                    </>
                )}

            </div>
        )}
    </div>
  );
}