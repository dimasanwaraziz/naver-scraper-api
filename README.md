# Naver SmartStore Scraper API

[cite_start]API ini dibuat untuk memenuhi tantangan coding scraping data detail produk dari Naver SmartStore[cite: 2]. [cite_start]API ini mampu melewati mekanisme anti-scraping sederhana dan mengembalikan data JSON mentah dari endpoint internal Naver[cite: 5, 10].

## Tech Stack

- **Backend**: Node.js, Express.js
- [cite_start]**Bahasa**: TypeScript [cite: 40]
- **HTTP Client**: Axios
- **Evasion**: `https-proxy-agent` untuk manajemen proxy, `user-agents` untuk rotasi User-Agent.

## [cite_start]Penjelasan Strategi Evasion [cite: 65]

[cite_start]Untuk memastikan scraping yang berhasil dan tidak terdeteksi, beberapa teknik diimplementasikan[cite: 27]:

1.  [cite_start]**Penggunaan Proxy Residensial**: Semua permintaan keluar diarahkan melalui proxy yang disediakan (`6n8xhsmh.as.thordata.net:9999`). Hal ini menyembunyikan alamat IP server dan menggunakan IP dari Korea Selatan, sehingga tampak seperti lalu lintas pengguna yang sah.
2.  **Rotasi User-Agent**: Setiap permintaan ke Naver menggunakan header `User-Agent` yang unik dan acak, yang dihasilkan oleh library `user-agents`. Ini mensimulasikan permintaan yang berasal dari berbagai kombinasi browser, perangkat, dan sistem operasi yang berbeda, sehingga mempersulit pemblokiran berbasis pola header.
3.  [cite_start]**Delay Acak**: Antara permintaan untuk mengambil halaman HTML (untuk `channelUid`) dan permintaan ke API JSON, ada jeda waktu singkat yang acak (antara 500ms - 1500ms). Ini membantu memecah pola permintaan yang cepat dan berurutan yang menjadi ciri khas bot.
4.  **Meniru Alur Pengguna**: Scraper pertama kali "mengunjungi" halaman produk HTML untuk mengambil `channelUid`, sama seperti yang akan dilakukan browser, sebelum menargetkan API internal. Ini membuat alur permintaan menjadi lebih alami.

## [cite_start]Setup & Instalasi 

1.  **Clone repositori ini:**
    ```bash
    git clone <URL_REPO_ANDA>
    cd naver-scraper-api
    ```

2.  **Instal dependensi:**
    ```bash
    npm install
    ```

3.  **Buat file `.env`:**
    Salin isi dari `.env.example` (jika ada) atau buat file `.env` baru di root proyek dengan konten berikut:
    ```env
    PORT=3000
    PROXY_HOST=6n8xhsmh.as.thordata.net
    PROXY_PORT=9999
    PROXY_USER=td-customer-mrscraper
    PROXY_PASS=P3nNRQ8C2
    ```

## [cite_start]Menjalankan Aplikasi [cite: 64]

-   **Mode Pengembangan (dengan hot-reload):**
    ```bash
    npm run dev
    ```
    Server akan berjalan di `http://localhost:3000`.

-   **Mode Produksi:**
    ```bash
    # Langkah 1: Kompilasi kode TypeScript ke JavaScript
    npm run build

    # Langkah 2: Jalankan aplikasi yang sudah dikompilasi
    npm run start
    ```

## [cite_start]Contoh Penggunaan API [cite: 66]

Gunakan `curl` atau alat API lainnya untuk menguji endpoint. Ganti URL produk sesuai kebutuhan.

```bash
curl -X GET "http://localhost:3000/naver?productUrl=[https://smartstore.naver.com/rainbows9030/products/11102379008](https://smartstore.naver.com/rainbows9030/products/11102379008)"
