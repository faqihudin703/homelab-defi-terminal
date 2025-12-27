# Homelab DeFi & NFT Terminal

**Experimental Omni-Chain Ecosystem (Sepolia ↔ Hoodi ↔ Base Sepolia ↔ Arbitrum Sepolia ↔ Optimism Sepolia)**

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Relayer](https://img.shields.io/badge/Infrastructure-Node.js-green)
![Frontend](https://img.shields.io/badge/Frontend-React_%2B_Vite-orange)
![Solidity](https://img.shields.io/badge/Smart_Contract-Solidity_0.8-lightgrey)

![Sepolia](https://img.shields.io/badge/L1-Sepolia-blue)
![Hoodi](https://img.shields.io/badge/L1-Hoodi-00B7FF)
![Base Sepolia](https://img.shields.io/badge/L2-Base_Sepolia-0052FF)
![Arbitrum Sepolia](https://img.shields.io/badge/L2-Arbitrum_Sepolia-2D3748)
![Optimism Sepolia](https://img.shields.io/badge/L2-Optimism_Sepolia-FF0420)

Platform Web3 eksperimental yang mengintegrasikan **DeFi (AMM/StableSwap)** dan **Cross-Chain NFT** di berbagai jaringan EVM layer-1 dan layer-2.
Project ini mendemonstrasikan infrastruktur full-stack: **Smart Contract Upgradeable**, **Off-chain Relayer**, **REST API**, dan **Frontend DApp**.

---

## 🏗️ Arsitektur Monorepo

| Komponen            | Path               | Deskripsi                                                                                                                                      |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Smart Contracts** | `/smart-contracts` | Kumpulan kontrak Solidity: Vault V3, AMM Pair, StableSwap, dan **ERC-721/1155 NFT Bridge**. Berbasis Hardhat & OpenZeppelin Upgradeable.       |
| **Bridge Relayer** | `/bridge-relayer`  | Layanan Node.js off-chain yang memonitor event blockchain, menangani routing aset (Token & NFT), dan menandatangani transaksi secara otomatis. |
| **Front-end DApp** | `/frontend`        | Antarmuka React + Vite dengan integrasi WalletConnect, manajemen state real-time, dan dashboard visualisasi transaksi.                         |
| **NFT API Service** | `/api-service`     | Backend (Express.js) untuk menangani rate-limiting update properti.                            |

---

## 🚀 Fitur Utama

### 1️⃣ Omni-Chain Asset Bridge
* **Token Bridge:** Transfer aset ERC-20 antar 5 chain (Sepolia, Hoodi, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia) menggunakan mekanisme *Lock-and-Mint*.
* **NFT Bridge:** Memindahkan NFT antar jaringan dengan menjaga metadata tetap sinkron.

### 2️⃣ Advanced NFT Ecosystem (NEW ✨)
* **Mint & Burn:** Pembuatan NFT dengan properti unik.
* **Dynamic Metadata:** User dapat mengedit atribut NFT (misal: change image, Rename), kemudian di-update on-chain.
* **Cross-Chain State:** Metadata NFT tetap persisten meskipun dipindahkan antar jaringan.

### 3️⃣ DeFi Protocols
* **Dual-Engine DEX:**
  * **Standard AMM:** Menggunakan formula $x \times y = k$ untuk aset volatile.
  * **StableSwap:** Algoritma khusus untuk aset *pegged* (USDT/USDC) dengan *low slippage*.
* **Liquidity Farming:** Staking LP token untuk mendapatkan reward.

### 4️⃣ Security & Infrastructure
* **Role-Based Access Control (RBAC):** Manajemen hak akses admin dan relayer.
* **API Rate Limiting:** Mencegah spamming pada endpoint metadata NFT.
* **Auto-Retry Mechanism:** Relayer otomatis mencoba ulang transaksi yang gagal karena *network congestion*.

---

## 🛠️ Cara Menjalankan

### **1. Konfigurasi Environment**
Salin file `.env.example` menjadi `.env` di setiap folder (`bridge-relayer`, `frontend`, `api-service`) dan isi Private Key serta RPC URL.

### **2. Bridge Relayer (Infrastruktur)**

```bash
cd bridge-relayer
npm install
node index.js
# atau menggunakan PM2:
# pm2 start index.js --name "bridge-relayer"
```

### **3. NFT API Service (Backend)**

```bash
cd api-service
npm install
node server.js
# atau menggunakan PM2:
# pm2 start server.js --name "api-service"
```

### **4. Frontend (User Interface)**

```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Struktur Direktori

```
homelab-defi-terminal/
├── smart-contracts/   # Solidity (Hardhat)
├── bridge-relayer/    # Node.js Event Listener
├── api-service/       # NFT Metadata API
└── frontend/          # React + Vite
```

---

## 🧭 Development Roadmap & Status

Proyek ini telah mencapai milestone pengembangan utama dengan fitur-fitur berikut yang sudah beroperasi penuh:

### Phase 1: Core Infrastructure ✅
- [x] **Smart Contract Architecture:** Implementasi pola Upgradeable (Proxy) untuk Vault dan Token.
- [x] **Bridge Mechanism:** Algoritma *Lock-and-Mint* untuk transfer aset lintas chain.
- [x] **Relayer Service:** Node.js service untuk monitoring event dan eksekusi transaksi otomatis.

### Phase 2: Multi-Chain Integration ✅
- [x] **L1 Support:** Sepolia & Hoodi Testnet.
- [x] **L2 Expansion:** Integrasi penuh ke **Base Sepolia**, **Arbitrum Sepolia**, dan **Optimism Sepolia**.
- [x] **Idempotency:** Perlindungan terhadap *double-spending* dan *replay attacks* pada Relayer.

### Phase 3: DeFi & NFT Ecosystem ✅
- [x] **Dual-Engine DEX:**
    - Standard AMM ($x \times y = k$) untuk aset volatil.
    - StableSwap Invariant untuk aset *pegged* (USDT/USDC).
- [x] **Advanced NFT System:**
    - Cross-Chain NFT Bridging.
    - **API Service:** Backend untuk menangani Rate Limiting update NFT.

### Phase 4: User Experience ✅
- [x] **Frontend Dashboard:** UI responsif menggunakan React + Vite.
- [x] **Wallet Integration:** Dukungan Multi-RPC dan deteksi jaringan otomatis.

---

## 🤝 Kontribusi

Pull request sangat diterima.
Gunakan branch `feature/<nama-fitur>` → PR ke `main`.

---

## 📜 Lisensi

MIT License
