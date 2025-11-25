import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const Web3Context = createContext();

export const useWeb3 = () => useContext(Web3Context);

// Helper: Deteksi apakah user pakai HP (untuk menghindari bug MetaMask Mobile)
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Helper: Timeout Promise (Agar tombol tidak loading selamanya jika MetaMask macet)
const withTimeout = (promise, ms) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms))
    ]);
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. FUNGSI CONNECT MANUAL
  const connectWallet = async () => {
    // Cek apakah MetaMask ada
    if (!window.ethereum) {
      // Jika di HP tapi buka di Chrome biasa -> Suruh buka di App MetaMask
      if (isMobileDevice()) {
          return alert("Mohon buka website ini di dalam Browser aplikasi MetaMask.");
      }
      return alert("MetaMask tidak terdeteksi! Silakan install ekstensi.");
    }

    try {
      setLoading(true);

      // Minta Akun dengan Timeout 15 Detik (Mencegah hang)
      await withTimeout(window.ethereum.request({ method: 'eth_requestAccounts' }), 15000);
      
      // Setup Ethers
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer = await _provider.getSigner();
      const _network = await _provider.getNetwork();
      const _address = await _signer.getAddress();

      // Simpan State
      setProvider(_provider);
      setSigner(_signer);
      setChainId(_network.chainId.toString());
      setAccount(_address);

      // Set Session agar tahan refresh
      sessionStorage.setItem('isWalletConnected', 'true'); 
      
    } catch (err) {
      console.error("Connect Error:", err);
      if (err.message === 'Request timeout') {
          alert("MetaMask tidak merespon. Coba buka kunci wallet Anda atau refresh halaman.");
      } else if (err.code === 4001) {
          // User reject, tidak perlu alert
      } else {
          alert("Gagal Konek: " + (err.message || "Unknown Error"));
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. FUNGSI DISCONNECT (HARD VS SOFT)
  const disconnectWallet = async () => {
    // Langkah 1: Hapus State Lokal (Soft Logout) - Wajib
    setAccount(null);
    setSigner(null);
    setChainId(null);
    sessionStorage.removeItem('isWalletConnected'); 
    
    // Langkah 2: Cabut Izin (Hard Logout) - HANYA DI DESKTOP
    // Di Mobile fitur ini sering bikin crash/hang, jadi kita skip.
    if (!isMobileDevice()) {
        try {
          await window.ethereum.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }]
          });
        } catch (error) {
          console.warn("Revoke permissions skipped or failed.");
        }
    }
  };

  // 3. AUTO-CONNECT (SESSION BASED)
  useEffect(() => {
    const initAuth = async () => {
      // Beri jeda sedikit untuk Mobile agar window.ethereum ter-inject
      await new Promise(r => setTimeout(r, 500));

      if (window.ethereum) {
        const hasSession = sessionStorage.getItem('isWalletConnected') === 'true';
        
        if (hasSession) {
          try {
             // Cek apakah user masih login di MetaMask (tanpa popup)
             const accounts = await window.ethereum.request({ method: 'eth_accounts' });
             if (accounts.length > 0) {
               // Restore Connection
               const _provider = new ethers.BrowserProvider(window.ethereum);
               const _signer = await _provider.getSigner();
               const _network = await _provider.getNetwork();
               
               setProvider(_provider);
               setSigner(_signer);
               setChainId(_network.chainId.toString());
               setAccount(accounts[0]);
             } else {
               // Sesi ada di storage, tapi di MetaMask user sudah logout
               disconnectWallet(); 
             }
          } catch (e) {
             console.warn("Auto-connect failed", e);
          }
        }
      }
      setLoading(false);
    };

    initAuth();

    // Listener Perubahan Akun/Network
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) disconnectWallet();
        else if (sessionStorage.getItem('isWalletConnected') === 'true') {
            // Refresh state jika ganti akun (dan sedang login)
            window.location.reload(); 
        }
      });

      window.ethereum.on('chainChanged', () => window.location.reload());
    }
  }, []);

  const value = {
    account, provider, signer, chainId,
    connectWallet, disconnectWallet, loading
  };

  return (
    <Web3Context.Provider value={value}>
      {!loading && children} 
    </Web3Context.Provider>
  );
};