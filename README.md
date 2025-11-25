# Homelab DeFi Terminal

**Experimental Cross-Chain DeFi Platform (Sepolia ↔ Hoodi ↔ Base Sepolia)**

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Sepolia](https://img.shields.io/badge/L1-Sepolia-blue)
![Hoodi](https://img.shields.io/badge/L1-Hoodi-00B7FF)
![Base](https://img.shields.io/badge/L2-Base_Sepolia-1e90ff)
![Relayer](https://img.shields.io/badge/Relayer-Node.js-green)
![Frontend](https://img.shields.io/badge/Frontend-React_%2B_Vite-orange)

Platform DeFi *cross-chain* eksperimental yang menghubungkan **Sepolia Testnet**, **Hoodi Testnet**, dan **Base Sepolia Testnet**.
Termasuk infrastruktur lengkap: **Smart Contract**, **Bridge Relayer**, dan **Frontend DApp**.

---

## 🏗️ Arsitektur Monorepo

| Komponen            | Path               | Deskripsi                                                                                                      |
| ------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Smart Contracts** | `/Smart Contracts` | Kontrak Solidity (Vault V3, SwapToken, StableSwap) berbasis Hardhat & OpenZeppelin Upgradeable.                |
| **Bridge Relayer**  | `/Bridge Relayer`  | Layanan Node.js off-chain untuk *event listener*, routing multi-chain, dan penandatanganan transaksi otomatis. |
| **Front-end DApp**   | `/Front-end`        | Antarmuka React + Vite dengan integrasi MetaMask/WalletConnect dan dukungan Mobile.                            |

---

## 🚀 Fitur Utama

### 1️⃣ Cross-Chain Bridge (Hub-and-Spoke)

* Unified Liquidity (Vault → wMRT)
* Lock & Mint
* Anti-Replay dengan transaction ID deterministik

### 2️⃣ DeFi Protocols

* **AMM DEX** (x*y = k)
* **StableSwap** (low slippage untuk stablecoin)

### 3️⃣ Security & UX

* Role-Based Access Control
* Auto-Reconnect Wallet

---

## 🛠️ Cara Menjalankan

### **1. Bridge Relayer**

Pastikan file `.env` sudah diisi (cek `.env.example`):

```bash
cd bridge-service
npm install
node index.js
# atau:
# docker-compose up -d
```

### **2. Frontend**

```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Struktur Direktori

```
homelab-defi-terminal/
├── smart-contracts/     # Upgradeable Contracts
├── bridge-service/      # Off-chain Relayer
└── frontend/            # React + Vite DApp
```

---

## 🧭 Roadmap

* [ ] UI DEX + Bridge final
* [ ] Dashboard relayer
* [ ] Support chain tambahan

---

## 🤝 Kontribusi

Pull request sangat diterima.
Gunakan branch `feature/<nama-fitur>` → PR ke `main`.

---

## 📜 Lisensi

MIT License
