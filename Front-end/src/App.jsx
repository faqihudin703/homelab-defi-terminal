import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import './App.css';

import { useWeb3 } from './context/Web3Context';

import Home from './components/Home';
import Bridge from './components/Bridge';
import Dex from './components/Dex';
import StableSwap from './components/StableSwap';

export default function App() {
  const { account, connectWallet, disconnectWallet } = useWeb3();

  const AccessDenied = ({ name }) => (
    <div className="access-denied">
      <p>&lt; ACCESS DENIED /&gt;</p>
      <p>Connect wallet to access {name}</p>
    </div>
  );

  return (
    <Router>
      <div className="app-container">

        {/* HEADER */}
        <header className="app-header">
          <div className="brand">
            <h1>Homelab DeFi Terminal</h1>
            <span>v2.1.0</span>
          </div>

          {!account ? (
            <button className="btn-connect" onClick={connectWallet}>
              [ Connect Wallet ]
            </button>
          ) : (
            <button className="wallet-info" onClick={disconnectWallet}>
              USER: {account.substring(0,6)}...{account.substring(38)} ❌
            </button>
          )}
        </header>

        {/* NAV */}
        <div className="nav-container">
          <nav>
            <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>Home</NavLink>
            <NavLink to="/bridge" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>Bridge</NavLink>
            <NavLink to="/dex" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>DEX</NavLink>
            <NavLink to="/stableswap" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>StableSwap</NavLink>
          </nav>
        </div>

        {/* CONTENT */}
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/bridge" element={account ? <Bridge /> : <AccessDenied name="Bridge" />} />
            <Route path="/dex" element={account ? <Dex /> : <AccessDenied name="DEX" />} />
            <Route path="/stableswap" element={account ? <StableSwap /> : <AccessDenied name="StableSwap" />} />
          </Routes>
        </main>

      </div>
    </Router>
  );
}
