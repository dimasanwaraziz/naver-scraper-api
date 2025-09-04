import axios from 'axios';
import fs from 'fs';
import path from 'path';
import UserAgent from 'user-agents';
import { Page, Protocol } from 'puppeteer';
import { getBrowser } from './puppeteerManager'; // <-- Ganti import

// Fungsi helper tetap sama
const randomDelay = (min = 500, max = 1500) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

const formatCookiesForAxios = (cookies: Protocol.Network.Cookie[]): string => {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
};

const sanitizeCookies = (cookies: any[]): Protocol.Network.Cookie[] => {
  return cookies.map(cookie => {
    if (cookie.sameSite === 'no_restriction') cookie.sameSite = 'None';
    else if (cookie.sameSite === null || cookie.sameSite === undefined) delete cookie.sameSite;
    if (cookie.expirationDate) {
      cookie.expires = cookie.expirationDate;
      delete cookie.expirationDate;
    }
    return cookie;
  }).filter(cookie => cookie.name);
};

// Fungsi scraper utama yang telah dimodifikasi
export const scrapeNaverHybrid = async (productUrl: string) => {
  console.log(`🚀 Starting hybrid scrape for: ${productUrl}`);
  let page: Page | null = null; // <-- Kita hanya mengelola 'page', bukan 'browser'

  try {
    console.log('🛡️  Step 1: Menggunakan browser yang sudah ada untuk membuka halaman baru...');
    const browser = getBrowser(); // <-- Ambil instance browser yang sudah berjalan
    page = await browser.newPage(); // <-- Buka tab baru, ini sangat cepat!

    if (process.env.PROXY_USER && process.env.PROXY_PASS) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
      });
    }

    try {
      const cookiesPath = path.join(__dirname, '..', 'cookies.json');
      const cookiesString = await fs.promises.readFile(cookiesPath, 'utf8');
      if (cookiesString) {
        const cleanCookies = sanitizeCookies(JSON.parse(cookiesString));
        await page.setCookie(...cleanCookies);
        console.log('🍪 Successfully loaded and sanitized cookies from file.');
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') console.error('❌ Failed to read or set cookies:', error.message);
      else console.log('⚠️ cookies.json not found, continuing without pre-set cookies.');
    }

    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });
    await page.setUserAgent(new UserAgent({ deviceCategory: 'desktop' }).toString());

    // --- NAVIGASI (tetap sama) ---
    console.log('☕ Warming up session by visiting Naver Shopping main page...');
    await page.goto('https://shopping.naver.com/', { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 5000);

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
      throw new Error('Failed to extract __PRELOADED_STATE__. Page might be blocked.');
    }

    const sessionCookies = await page.cookies();
    const newCookiesPath = path.join(__dirname, '..', 'cookies.json');
    await fs.promises.writeFile(newCookiesPath, JSON.stringify(sessionCookies, null, 2));
    console.log('💾 Session cookies have been updated in cookies.json');

    await page.close();
    page = null;
    console.log('📄 Halaman ditutup, browser tetap berjalan.');

    const channelUid = preloadedState.app?.channel?.channelUid || preloadedState.smartStoreV2?.channel.channelUid;
    const productId = productUrl.match(/\/products\/(\d+)/)?.[1];
    if (!channelUid || !productId) {
      throw new Error('Failed to extract channelUid or productId.');
    }

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
    if (page) await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
    throw error;
  } finally {
    // Pastikan halaman selalu ditutup jika terjadi error
    if (page) {
      await page.close();
      console.log('📄 Halaman ditutup di blok finally karena ada error.');
    }
  }
};

