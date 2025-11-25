# Dockerfile (Versi Tanpa npm install)

# Gunakan base image Node.js yang ringan
FROM node:18-alpine

# Tetapkan direktori kerja di dalam container
WORKDIR /usr/src/app

# Salin SEMUA file dari folder proyek di server ke dalam container
# Ini sudah termasuk index.js, abi/, keystore/, dan node_modules/
COPY . .

# Perintah yang akan dijalankan saat container dimulai
CMD [ "node", "index.js" ]
