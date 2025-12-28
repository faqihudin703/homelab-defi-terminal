import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="welcome-container">
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⚡ Homelab Omni-Chain Terminal</h1>
        <p style={{ color: '#8b949e' }}>Experimental DeFi & NFT Infrastructure</p>
        
        {/* Badge Chain Support */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px', flexWrap: 'wrap' }}>
          {['Sepolia', 'Hoodi', 'Base', 'Arbitrum', 'Optimism'].map(chain => (
            <span key={chain} style={{ 
              background: '#21262d', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '0.8rem', 
              border: '1px solid #30363d',
              color: '#58a6ff'
            }}>
              ● {chain}
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ textAlign: 'left', background: '#161b22', padding: '30px', borderRadius: '12px', border: '1px solid #30363d' }}>
        <p style={{ fontSize: '1.1rem' }}>
          Sistem ini adalah demonstrasi infrastruktur Web3 Full-Stack yang berjalan di lingkungan Homelab.
          Platform ini mengintegrasikan protokol DeFi dan standar NFT lintas jaringan.
        </p>
        
        <h3 style={{ marginTop: '30px', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>🚀 Modul Tersedia:</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
            
            {/* FITUR 1: DEFI */}
            <div style={{ background: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d' }}>
                <h4 style={{ color: '#7ee787' }}>🌊 DeFi Protocols</h4>
                <ul style={{ color: '#8b949e', listStyle: 'none', paddingLeft: '0', fontSize: '0.9rem', lineHeight: '1.6' }}>
                   <li>• <strong>AMM DEX:</strong> Swap aset volatil ($x*y=k$)</li>
                   <li>• <strong>StableSwap:</strong> Low slippage untuk stablecoin</li>
                   <li>• <strong>Liquidity Farming:</strong> Stake LP & Earn</li>
                </ul>
            </div>

            {/* FITUR 2: BRIDGE */}
            <div style={{ background: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d' }}>
                <h4 style={{ color: '#a5d6ff' }}>🌉 Omni-Bridge</h4>
                <ul style={{ color: '#8b949e', listStyle: 'none', paddingLeft: '0', fontSize: '0.9rem', lineHeight: '1.6' }}>
                   <li>• <strong>Token Bridge:</strong> Lock-and-Mint architecture</li>
                   <li>• <strong>NFT Bridge:</strong> Pindahkan NFT antar L1 & L2</li>
                   <li>• <strong>Relayer:</strong> Node.js Event-Driven Engine</li>
                </ul>
            </div>

            {/* FITUR 3: NFT (Baru) */}
            <div style={{ background: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d' }}>
                <h4 style={{ color: '#d2a8ff' }}>🖼️ NFT Labs</h4>
                <ul style={{ color: '#8b949e', listStyle: 'none', paddingLeft: '0', fontSize: '0.9rem', lineHeight: '1.6' }}>
                   <li>• <strong>Minting:</strong> Buat NFT Unik</li>
                   <li>• <strong>Dynamic Metadata:</strong> Edit properti NFT</li>
                   <li>• <strong>Security:</strong> API Rate-Limiting Protection</li>
                </ul>
            </div>

        </div>

        <div style={{ marginTop: '40px', textAlign: 'center', display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <Link to="/dex">
                <button className="btn-lock" style={{ padding: '12px 30px', background: '#238636' }}>
                   📈 Buka DEX
                </button>
            </Link>
            <Link to="/nft">
                <button className="btn-lock" style={{ padding: '12px 30px', background: '#1f6feb' }}>
                   🎨 Kelola NFT
                </button>
            </Link>
        </div>
      </div>
    </div>
  );
}