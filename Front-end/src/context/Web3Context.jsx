import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const Web3Context = createContext();
export const useWeb3 = () => useContext(Web3Context);

// Helper: Timeout Promise (MetaMask Desktop kadang hang)
const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms)
    )
  ]);
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. CONNECT WALLET (DESKTOP ONLY)
  const connectWallet = async () => {
    if (!window.ethereum) {
      return alert(
        "❌ SYSTEM ERROR: MetaMask Extension Not Found!\nPlease install MetaMask on your Desktop Browser."
      );
    }

    try {
      setLoading(true);

      await withTimeout(
        window.ethereum.request({ method: 'eth_requestAccounts' }),
        15000
      );

      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer = await _provider.getSigner();
      const _network = await _provider.getNetwork();
      const _address = await _signer.getAddress();

      setProvider(_provider);
      setSigner(_signer);
      setChainId(Number(_network.chainId));
      setAccount(_address);

      sessionStorage.setItem('isWalletConnected', 'true');
    } catch (err) {
      console.error("Connect Error:", err);
      if (err.code !== 4001) {
        alert("CONNECTION FAILED: " + (err.message || "Unknown Error"));
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. DISCONNECT WALLET (HARD REVOKE)
  const disconnectWallet = async () => {
    setAccount(null);
    setSigner(null);
    setChainId(null);
    sessionStorage.removeItem('isWalletConnected');

    if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }]
        });
      } catch (e) {
        console.warn("Revoke skipped/cancelled by user.");
      }
    }

    // Pastikan state benar-benar bersih
    window.location.reload();
  };

  // 3. AUTO-CONNECT & LISTENERS
  useEffect(() => {
    const initAuth = async () => {
      if (
        window.ethereum &&
        sessionStorage.getItem('isWalletConnected') === 'true'
      ) {
        try {
          const accounts = await window.ethereum.request({
            method: 'eth_accounts'
          });

          if (accounts.length > 0) {
            const _provider = new ethers.BrowserProvider(window.ethereum);
            const _signer = await _provider.getSigner();
            const _network = await _provider.getNetwork();

            setProvider(_provider);
            setSigner(_signer);
            setChainId(Number(_network.chainId));
            setAccount(accounts[0]);
          } else {
            sessionStorage.removeItem('isWalletConnected');
          }
        } catch (e) {
          console.warn("Auto-connect failed", e);
        }
      }
      setLoading(false);
    };

    initAuth();

    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnectWallet();
      else window.location.reload();
    };

    const handleChainChanged = () => window.location.reload();

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  // ⬇️ PENTING: VALUE HARUS TETAP INI
  const value = {
    account,
    provider,
    signer,
    chainId,
    connectWallet,
    disconnectWallet,
    loading
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
};
