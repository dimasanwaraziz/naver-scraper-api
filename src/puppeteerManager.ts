import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import dotenv from 'dotenv';

// Konfigurasi awal, termasuk .env dan plugin Stealth
dotenv.config();
puppeteer.use(StealthPlugin());

// Variabel untuk menyimpan satu-satunya instance browser
let browserInstance: Browser | null = null;

/**
 * Meluncurkan dan menginisialisasi instance browser Puppeteer.
 * Hanya akan membuat instance baru jika belum ada.
 */
export const initializeBrowser = async (): Promise<Browser> => {
  if (browserInstance) {
    return browserInstance;
  }

  console.log('🚀 Meluncurkan instance browser persistent...');
  browserInstance = await puppeteer.launch({
    headless: false, // Set 'true' untuk production, 'false' untuk debug
    devtools: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      process.env.PROXY_HOST ? `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}` : ''
    ].filter(Boolean)
  });

  // Listener untuk menangani jika browser terputus secara tak terduga
  browserInstance.on('disconnected', () => {
    console.log('🔴 Browser terputus. Instance akan direset.');
    browserInstance = null;
  });

  console.log('✅ Browser siap menerima perintah.');
  return browserInstance;
};

/**
 * Mengambil instance browser yang sedang berjalan.
 * Melempar error jika browser belum diinisialisasi.
 */
export const getBrowser = (): Browser => {
  if (!browserInstance) {
    throw new Error('Browser belum diinisialisasi. Panggil initializeBrowser() saat server start.');
  }
  return browserInstance;
};

/**
 * Menutup instance browser yang sedang berjalan.
 * Berguna untuk graceful shutdown.
 */
export const closeBrowser = async (): Promise<void> => {
  if (browserInstance) {
    console.log('🌙 Menutup instance browser...');
    await browserInstance.close();
    browserInstance = null;
  }
};

