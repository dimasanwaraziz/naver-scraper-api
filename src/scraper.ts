// src/scraper.ts
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import UserAgent from 'user-agents';
import dotenv from 'dotenv';
import { Protocol } from 'puppeteer';

// Terapkan plugin stealth ke puppeteer
puppeteer.use(StealthPlugin());
dotenv.config();

// Fungsi helper untuk delay acak
const randomDelay = (min = 500, max = 1500) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

const formatCookiesForAxios = (cookies: Protocol.Network.Cookie[]): string => {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
};

const sanitizeCookies = (cookies: any[]): Protocol.Network.Cookie[] => {
  return cookies.map(cookie => {
    if (cookie.sameSite === 'no_restriction') {
      cookie.sameSite = 'None';
    } else if (cookie.sameSite === null || cookie.sameSite === undefined) {
      delete cookie.sameSite;
    }
    if (cookie.expirationDate) {
      cookie.expires = cookie.expirationDate;
      delete cookie.expirationDate;
    }
    return cookie;
  }).filter(cookie => cookie.name);
};

export const scrapeNaverHybrid = async (productUrl: string) => {
  console.log(`🚀 Starting hybrid scrape for: ${productUrl}`);
  let browser;

  try {
    console.log('🛡️  Step 1: Infiltrating with Puppeteer...');

    // --- PENGECEKAN PROXY ---
    // Log ini akan membantu Anda mengonfirmasi apakah skrip menggunakan proxy dari file .env
    if (process.env.PROXY_HOST) {
      console.log(`- Using proxy server: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
      if (process.env.PROXY_USER) {
        console.log(`- Using proxy user: ${process.env.PROXY_USER}`);
      } else {
        console.log(`- No proxy user defined.`);
      }
    } else {
      console.log('- No proxy server configured.');
    }
    // --- AKHIR PENGECEKAN ---

    browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // <-- TEKNIK BARU: Sembunyikan tanda 'automation'
        process.env.PROXY_HOST ? `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}` : ''
      ].filter(Boolean)
    });

    const page = await browser.newPage();

    // --- OTENTIKASI PROXY ---
    // Error 'ERR_INVALID_AUTH_CREDENTIALS' biasanya berasal dari blok ini.
    // Pastikan PROXY_USER dan PROXY_PASS di file .env Anda sudah benar.
    if (process.env.PROXY_USER) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS!
      });
    }

    // --- BLOK COOKIE YANG DIPERBAIKI ---
    try {
      const cookiesPath = path.join(__dirname, '..', 'cookies.json');
      const cookiesString = await fs.promises.readFile(cookiesPath, 'utf8');
      if (cookiesString) {
        const rawCookies = JSON.parse(cookiesString);
        const cleanCookies = sanitizeCookies(rawCookies);
        await page.setCookie(...cleanCookies);
        console.log('🍪 Successfully loaded and sanitized cookies from file.');
      } else {
        console.log('⚠️ Cookies file is empty. Continuing without them.');
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ cookies.json not found in project root.');
      } else {
        console.error('❌ Failed to read or set cookies:', error.message);
      }
    }

    // TEKNIK BARU: Randomisasi viewport agar tidak selalu sama
    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });

    await page.setUserAgent(new UserAgent({ deviceCategory: 'desktop' }).toString());

    // TEKNIK BARU: "Pemanasan" sesi dengan mengunjungi halaman utama terlebih dahulu
    console.log('☕ Warming up session by visiting Naver Shopping main page...');
    await page.goto('https://shopping.naver.com/', { waitUntil: 'domcontentloaded' });

    console.log(`- Waiting for a random delay before proceeding...`);
    await randomDelay(2000, 5000); // Tunggu 2-5 detik, seperti manusia

    // Sekarang baru navigasi ke halaman produk yang sebenarnya
    console.log(`➡️ Navigating to the actual product page: ${productUrl}`);
    await page.goto(productUrl, {
      waitUntil: 'networkidle2',
      referer: 'https://shopping.naver.com/'
    });

    console.log('🕵️  Pausing for 10 seconds for visual inspection...');
    await new Promise(r => setTimeout(r, 10000));

    const preloadedState = await page.evaluate(() => (window as any).__PRELOADED_STATE__);

    if (!preloadedState) {
      await page.screenshot({ path: 'failure_screenshot.png', fullPage: true });
      console.log('📸 Screenshot of failure page saved to failure_screenshot.png');
      throw new Error('Failed to extract __PRELOADED_STATE__. Page is blocked or has a different structure.');
    }

    const sessionCookies = await page.cookies();
    const newCookiesPath = path.join(__dirname, '..', 'cookies.json');
    await fs.promises.writeFile(newCookiesPath, JSON.stringify(sessionCookies, null, 2));
    console.log('💾 Session cookies have been updated in cookies.json');

    console.log('✅ Session data acquired. Closing browser...');
    await browser.close();
    browser = undefined;

    const channelUid = preloadedState.app?.channel?.channelUid || preloadedS_STATE.smartStoreV2?.channel.channelUid;
    const productId = productUrl.match(/\/products\/(\d+)/)?.[1];

    if (!channelUid || !productId) {
      throw new Error('Failed to extract channelUid or productId from preloaded state.');
    }
    console.log(`- Extracted channelUid: ${channelUid}`);

    console.log('⚡️ Step 2: Fetching API data with Axios...');
    const cookieHeader = formatCookiesForAxios(sessionCookies);
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    const axiosOptions = {
      headers: {
        'User-Agent': userAgent.toString(),
        'Referer': productUrl,
        'Cookie': cookieHeader
      }
    };

    const benefitsApiUrl = `https://smartstore.naver.com/benefits/by-product?productId=${productId}`;
    const productDetailsApiUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productId}?withWindow=false`;

    const [benefitsResponse, detailsResponse] = await Promise.all([
      axios.get(benefitsApiUrl, axiosOptions),
      axios.get(productDetailsApiUrl, axiosOptions)
    ]);

    console.log('✅ Hybrid scrape completed successfully!');
    return {
      benefitsData: benefitsResponse.data,
      productDetailsData: detailsResponse.data
    };

  } catch (error: any) {
    console.error('❌ Hybrid scraping failed:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed in finally block due to an error.');
    }
  }
};


