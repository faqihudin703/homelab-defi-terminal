// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';

import { useWeb3 } from './context/Web3Context';

// Components
import Home from './components/Home';
import Bridge from './components/Bridge';
import Dex from './components/Dex';
import StableSwap from './components/StableSwap';
import NftTerminal from './components/NftTerminal';

export default function App() {
  const { account, connectWallet, disconnectWallet } = useWeb3();

  // Komponen Helper (Access Guard)
  const AccessDenied = ({ name }) => (
    <div
      className="access-denied"
      style={{
        border: '1px dashed red',
        padding: '20px',
        color: 'red',
        textAlign: 'center'
      }}
    >
      <p>⚠️ &lt; ACCESS DENIED /&gt;</p>
      <p>Please connect your wallet to access the {name} Protocol.</p>
    </div>
  );

  return (
    <Router>
      <div className="app-container">

        {/* HEADER */}
        <header className="app-header">
          <div className="brand">
            <h1>⚡ Homelab DEFI Terminal</h1>
            <span>v2.1.0</span>
          </div>

          {!account ? (
            <button className="btn-connect" onClick={connectWallet}>
              [ INITIALIZE_CONNECTION ]
            </button>
          ) : (
            <button className="wallet-info" onClick={disconnectWallet}>
              USER: {account.substring(0, 6)}...{account.substring(38)} [DISCONNECT] ❌
            </button>
          )}
        </header>

        {/* NAVIGATION */}
        <div className="nav-container">
          <nav>
            <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              &gt; HOME
            </NavLink>

            <NavLink to="/bridge" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              &gt; BRIDGE
            </NavLink>

            <NavLink to="/dex" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              &gt; DEX (SWAP)
            </NavLink>

            <NavLink to="/stableswap" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              &gt; STABLESWAP
            </NavLink>

            <NavLink to="/nft" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              &gt; NFT TERMINAL
            </NavLink>
          </nav>
        </div>

        {/* CONTENT */}
        <main>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />

            {/* Protected Routes */}
            <Route
              path="/bridge"
              element={account ? <Bridge /> : <AccessDenied name="Bridge" />}
            />

            <Route
              path="/dex"
              element={account ? <Dex /> : <AccessDenied name="DEX" />}
            />

            <Route
              path="/stableswap"
              element={account ? <StableSwap /> : <AccessDenied name="StableSwap" />}
            />

            <Route
              path="/nft"
              element={account ? <NftTerminal /> : <AccessDenied name="NFT Terminal" />}
            />
          </Routes>
        </main>

      </div>
    </Router>
  );
}
