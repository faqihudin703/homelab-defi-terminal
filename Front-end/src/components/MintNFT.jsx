import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import { CONFIG } from '../config';
import { useWeb3 } from '../context/Web3Context';

import NFTABI from '../abis/NFTHomelab.json';

// --- KONFIGURASI LIMIT ---
const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_PIN_COUNT = 500;    // Batas Global (Pinata)
const MAX_NFT_PER_WALLET = 15; // Batas Personal (Per User)

// ABI Minimal untuk Cek Saldo
const ERC721_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

export default function MintNFT({ onSuccess }) {
  const { account, chainId, provider } = useWeb3();
  
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [preview, setPreview] = useState(null);
  
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // State Limit
  const [pinCount, setPinCount] = useState(0);
  const [userNftCount, setUserNftCount] = useState(0);
  const [isGlobalLimitReached, setIsGlobalLimitReached] = useState(false);
  const [isUserLimitReached, setIsUserLimitReached] = useState(false);
  
  const getSigner = async () => {
    if (!provider) throw new Error("Wallet belum terhubung");
    return await provider.getSigner();
  };

  // --- 1. CEK SEMUA LIMIT SAAT LOAD ---
  useEffect(() => {
    if (account) {
      checkLimits();
    }
  }, [account]);

  const checkLimits = async () => {
      try {
          // A. Cek Limit Global (Pinata)
          const res = await axios.get(`https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=1`, {
              headers: { 'Authorization': `Bearer ${CONFIG.PINATA.JWT}` }
          });
          const currentPinCount = res.data.count;
          setPinCount(currentPinCount);
          if (currentPinCount >= MAX_PIN_COUNT) setIsGlobalLimitReached(true);

          // B. Cek Limit User (BalanceOf)
          const provider = new ethers.JsonRpcProvider(CONFIG.NETWORKS.SEPOLIA.RPC_URL);
          const nftContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT, ERC721_BALANCE_ABI, provider);
          const balance = await nftContract.balanceOf(account);
          const count = Number(balance);
          
          setUserNftCount(count);
          if (count >= MAX_NFT_PER_WALLET) setIsUserLimitReached(true);

      } catch (err) {
          console.error("Gagal cek limit:", err);
      }
  };

  // ... (handleFileChange sama seperti sebelumnya) ...
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
          alert(`❌ File terlalu besar! Maksimal ${MAX_FILE_SIZE_MB}MB.`);
          e.target.value = "";
          return;
      }
      if (!selectedFile.type.startsWith("image/")) {
          alert("❌ Hanya file gambar.");
          return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  // ... (uploadToIPFS sama seperti sebelumnya) ...
  const uploadToIPFS = async () => {
      // ... Copy logic upload dari kode sebelumnya ...
      // (Agar jawaban tidak terlalu panjang, saya singkat bagian ini karena tidak berubah)
      // Pastikan Anda menyalin fungsi uploadToIPFS yang lengkap dari kode sebelumnya.
      const JWT = CONFIG.PINATA.JWT;
      const formData = new FormData();
      formData.append('file', file);
      const metadataFile = JSON.stringify({ name: `IMG-${Date.now()}` });
      formData.append('pinataMetadata', metadataFile);
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      const resFile = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, { headers: { 'Authorization': `Bearer ${JWT}` } });
      const imageHash = resFile.data.IpfsHash;
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageHash}`;
      const metadataJson = JSON.stringify({
        pinataContent: {
          name: name, description: desc, image: `ipfs://${imageHash}`, external_url: imageUrl,
          attributes: [{ trait_type: "Creator", value: "Homelab User" }]
        },
        pinataMetadata: { name: `META-${Date.now()}.json` }
      });
      const resMeta = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadataJson, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JWT}` } });
      return `ipfs://${resMeta.data.IpfsHash}`;
  };

  // --- MINT HANDLER ---
  const handleMint = async () => {
    if (isGlobalLimitReached) return alert("Kuota Server Penuh!");
    if (isUserLimitReached) return alert(`Anda sudah mencapai batas ${MAX_NFT_PER_WALLET} NFT!`);
    if (!file || !name) return alert("Lengkapi data!");
    
    setIsLoading(true);
    try {
      const tokenURI = await uploadToIPFS();
      setStatus("🔨 Minting di Blockchain...");

      const signer = await getSigner();
      const nftContract = new ethers.Contract(CONFIG.CONTRACTS.SEPOLIA.NFT, NFTABI, signer);
      
      let price = 0;
      try { price = await nftContract.mintPrice(); } catch {}

      const tx = await nftContract.mint(tokenURI, { value: price });
      setStatus("⏳ Menunggu konfirmasi...");
      await tx.wait();

      setStatus(`✅ NFT Berhasil Dicetak!`);
      setFile(null); setPreview(null); setName(""); setDesc("");
      
      // Refresh Limit & Callback
      checkLimits();
      if(onSuccess) onSuccess();

    } catch (err) {
      setStatus("❌ Gagal: " + (err.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="terminal-card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
            <h3>MINT NFT</h3>
            <div style={{display:'flex', gap:'10px'}}>
                {/* Indikator Personal Limit */}
                <span style={{fontSize:'0.7rem', color: isUserLimitReached ? '#ff3333' : '#00ff41', border:'1px solid #333', padding:'2px 6px', borderRadius:'4px'}}>
                    My Limit: {userNftCount}/{MAX_NFT_PER_WALLET}
                </span>
                {/* Indikator Global Limit */}
                <span style={{fontSize:'0.7rem', color: isGlobalLimitReached ? '#ff3333' : '#8b949e', border:'1px solid #333', padding:'2px 6px', borderRadius:'4px'}}>
                    Server: {pinCount}/500
                </span>
            </div>
        </div>
        
        {status && <div className="status-log" style={{marginBottom: '15px'}}>{status}</div>}

        {/* BLOKIR JIKA LIMIT TERCAPAI */}
        {isGlobalLimitReached ? (
            <div className="access-denied" style={{padding:'20px'}}>
                <p style={{color:'#ff3333'}}>⛔ SERVER PENUH</p>
            </div>
        ) : isUserLimitReached ? (
            <div className="access-denied" style={{padding:'20px'}}>
                <p style={{color:'#ff3333'}}>⛔ BATAS PRIBADI TERCAPAI</p>
                <p>Anda maksimal memiliki {MAX_NFT_PER_WALLET} NFT.</p>
            </div>
        ) : (
            <>
                {/* ... (Bagian Upload & Input Sama Seperti Sebelumnya) ... */}
                {!preview ? (
                    <div className="upload-area">
                        <input type="file" accept="image/*" onChange={handleFileChange} className="file-input-hidden" />
                        <p style={{fontSize: '2rem', marginBottom: '10px'}}>📂</p>
                        <p>Upload Gambar (Max {MAX_FILE_SIZE_MB}MB)</p>
                    </div>
                ) : (
                    <div className="nft-preview-container">
                        <img src={preview} alt="Preview" className="nft-preview-img" />
                        <button className="btn-burn" style={{marginTop: '10px', padding: '5px'}} onClick={()=>setPreview(null)}>Ganti</button>
                    </div>
                )}

                <div className="input-group">
                    <label>Nama Aset</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Deskripsi</label>
                    <input type="text" value={desc} onChange={e => setDesc(e.target.value)} />
                </div>

                <button className="btn-lock mt-20" onClick={handleMint} disabled={isLoading}>
                    {isLoading ? "PROSESING..." : "MINT SEKARANG 🚀"}
                </button>
            </>
        )}
    </div>
  );
}