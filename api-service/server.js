import 'dotenv/config'; // Pastikan ini ada di baris paling atas!
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

const app = express();

// 1. KONFIGURASI HOST & PORT
const PORT = process.env.API_PORT || 3002;
// Gunakan '0.0.0.0' agar bisa diakses dari luar container/server (bukan cuma localhost)
const HOST = '0.0.0.0'; 

// 2. DEBUG CONFIG
const NFT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;

// Middleware
app.use(cors()); 
app.use(express.json());

// ... (Setup Database & Tabel SAMA SEPERTI SEBELUMNYA) ...
const db = new Database('homelab.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS nft_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tokenId TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )
`);

const LIMIT_COUNT = 4; 
const LIMIT_DAYS = 30; 

const API_SECRET = process.env.API_SECRET;

// Middleware Cek Password
app.use((req, res, next) => {
    // Izinkan semua orang membaca data (GET)
    if (req.method === 'GET') return next();
    
    // Tapi harus pakai password untuk menulis (POST)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== API_SECRET) {
        return res.status(403).json({ error: "Akses ditolak! API Key salah." });
    }
    next();
});

// ... (Route API GET & POST SAMA SEPERTI SEBELUMNYA) ...
app.get('/api/nft/limit/:tokenId', (req, res) => {
    // ... logic sama ...
    const { tokenId } = req.params;
    const cutoffTime = Date.now() - (LIMIT_DAYS * 24 * 60 * 60 * 1000);
    try {
        const stmt = db.prepare('SELECT count(*) as count FROM nft_logs WHERE tokenId = ? AND timestamp > ?');
        const result = stmt.get(tokenId, cutoffTime);
        res.json({
            tokenId,
            used: result.count,
            limit: LIMIT_COUNT,
            isLimitReached: result.count >= LIMIT_COUNT,
            contract: NFT_ADDRESS 
        });
    } catch (e) {
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/nft/record', (req, res) => {
    // ... logic sama ...
    const { tokenId } = req.body;
    if (!tokenId) return res.status(400).json({ error: "Token ID required" });
    try {
        const stmt = db.prepare('INSERT INTO nft_logs (tokenId, timestamp) VALUES (?, ?)');
        stmt.run(tokenId, Date.now());
        console.log(`📝 [${NFT_ADDRESS}] Update dicatat: Token #${tokenId}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Gagal menyimpan" });
    }
});


// 3. JALANKAN SERVER (BIND KE 0.0.0.0)
app.listen(PORT, HOST, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Backend SQLite ONLINE`);
    console.log(`🌐 Listening on: http://${HOST}:${PORT}`);
    console.log(`🏠 Local Access: http://127.0.0.1:${PORT}`);
    
    // Cek apakah variable env terbaca
    if (!NFT_ADDRESS) {
        console.warn(`⚠️  PERINGATAN: NFT_CONTRACT_ADDRESS tidak ditemukan di .env!`);
    } else {
        console.log(`ℹ️  Target Kontrak: ${NFT_ADDRESS}`);
    }
    console.log(`==================================================\n`);
});