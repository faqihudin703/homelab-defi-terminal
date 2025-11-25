import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="welcome-container">
      <h2>Selamat Datang di Homelab DeFi Terminal!</h2>
      
      <div style={{ textAlign: 'left', background: '#161b22', padding: '30px', borderRadius: '8px', border: '1px solid #30363d' }}>
        <p> Ini adalah DeFi yang dibuat di Homelab dan terhubung ke jaringan Sepolia Testnet dan Hoodi Testnet.</p>
        <p> Gunakan menu navigasi di atas untuk mengakses fitur-fitur canggih seperti:</p>
        <ul style={{ color: '#8b949e', listStyle: 'none', paddingLeft: '20px' }}>
            <li>[1] Cross-Chain Bridge</li>
            <li>[2] DEX AMM (Aset Fluktuatif)</li>
            <li>[3] StableSwap DEX (Aset Stabil)</li>
        </ul>
        <p style={{ marginTop: '30px', color: '#f39c12' }}>
            ⚠️ Pastikan wallet MetaMask Anda terhubung untuk memulai.
        </p>
        
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
            <Link to="/bridge">
                <button className="btn-lock" style={{ width: '200px' }}>
                    Buka Bridge Terminal _
                </button>
            </Link>
        </div>
      </div>
    </div>
  );
}