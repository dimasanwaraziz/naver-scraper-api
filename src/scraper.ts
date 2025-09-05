import axios from 'axios';
import UserAgent from 'user-agents';
import { Page } from 'puppeteer';
import { getBrowser } from './puppeteerManager';

// Fungsi helper untuk delay acak
const randomDelay = (min = 1000, max = 3000) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

interface MinimalCookie {
  name: string;
  value: string;
}

// Fungsi helper untuk memformat cookies untuk Axios, sekarang menggunakan tipe yang lebih fleksibel.
const formatCookiesForAxios = (cookies: MinimalCookie[]): string => {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
};

export const scrapeNaverHybrid = async (productUrl: string) => {
  console.log(`🚀 Starting hybrid scrape for: ${productUrl}`);
  let page: Page | null = null;

  try {
    const browser = getBrowser();
    page = await browser.newPage();
    console.log('🛡️  Step 1: Halaman baru berhasil dibuat.');

    if (process.env.PROXY_USER && process.env.PROXY_PASS) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
      });
    }

    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });
    await page.setUserAgent(new UserAgent({ deviceCategory: 'desktop' }).toString());

    // --- STRATEGI BARU: MENCARI DAN MENGKLIK PRODUK ---
    console.log('🤖 Memulai alur navigasi baru via pencarian produk...');

    // 1. Ekstrak ID Produk dari URL
    const productId = productUrl.match(/\/products\/(\d+)/)?.[1];
    if (!productId) {
      throw new Error('Gagal mengekstrak Product ID dari URL.');
    }
    console.log(`- Product ID diekstrak: ${productId}`);

    // 2. Kunjungi halaman utama dan cari produk berdasarkan ID
    await page.goto('https://shopping.naver.com/', { waitUntil: 'networkidle2' });
    console.log('- Halaman utama Naver Shopping berhasil dimuat.');

    const searchInputSelector = 'input[placeholder="상품명 또는 브랜드 입력"]';
    await page.waitForSelector(searchInputSelector);
    await page.type(searchInputSelector, productId);
    await page.keyboard.press('Enter');
    console.log(`- Mencari produk dengan ID: ${productId}`);

    // 3. Tunggu navigasi ke halaman hasil pencarian dan klik link produk
    console.log('- Menunggu halaman hasil pencarian...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const productLinkSelector = `a[href*="${productId}"]`;
    console.log(`- Mencari link produk dengan selector: ${productLinkSelector}`);
    await page.waitForSelector(productLinkSelector, { timeout: 20000 });

    // Menggunakan evaluate untuk klik agar lebih andal
    await page.evaluate(selector => {
      const link = document.querySelector(selector) as HTMLElement;
      if (link) link.click();
    }, productLinkSelector);

    console.log('- Link produk ditemukan dan diklik.');

    // 4. Tunggu navigasi terakhir ke halaman produk
    console.log('- Menunggu halaman produk termuat setelah di-klik...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log('✅ Navigasi ke halaman produk selesai dengan sukses.');
    // --- AKHIR STRATEGI BARU ---

    const preloadedState = await page.evaluate(() => (window as any).__PRELOADED_STATE__);
    if (!preloadedState) {
      await page.screenshot({ path: 'failure_screenshot.png', fullPage: true });
      throw new Error('Failed to extract __PRELOADED_STATE__. Page might be blocked or has a different structure.');
    }

    const sessionCookies = await page.cookies();
    const channelUid = preloadedState.app?.channel?.channelUid || preloadedState.smartStoreV2?.channel.channelUid;

    if (!channelUid) {
      throw new Error('Failed to extract channelUid from preloaded state.');
    }

    console.log('⚡️ Step 2: Fetching API data with Axios...');
    const cookieHeader = formatCookiesForAxios(sessionCookies);
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    const axiosOptions = {
      headers: { 'User-Agent': userAgent.toString(), 'Referer': productUrl, 'Cookie': cookieHeader }
    };

    const benefitsApiUrl = `https://smartstore.naver.com/benefits/by-product?productId=${productId}`;
    const productDetailsApiUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productId}?withWindow=false`;

    console.log('- Mengambil data benefits...');
    const benefitsResponse = await axios.get(benefitsApiUrl, axiosOptions);

    console.log(`- Menunggu delay acak untuk menghindari rate limit...`);
    await randomDelay();

    let detailsResponseData;
    try {
      console.log('- Mencoba mengambil data detail produk via Axios...');
      const detailsResponse = await axios.get(productDetailsApiUrl, axiosOptions);
      detailsResponseData = detailsResponse.data;
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        console.warn('⚠️ Axios request diblokir (429). Beralih ke metode fallback (fetch via browser)...');
        detailsResponseData = await page.evaluate(async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Browser fetch failed with status ${response.status}`);
          return response.json();
        }, productDetailsApiUrl);
      } else {
        throw error;
      }
    }

    console.log('✅ Hybrid scrape completed successfully!');
    return {
      benefitsData: benefitsResponse.data,
      productDetailsData: detailsResponseData
    };

  } catch (error: any) {
    console.error('❌ Hybrid scraping failed:', error.message);
    if (page) await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
    throw error;
  } finally {
    if (page) {
      // await page.close(); // <-- DINONAKTIFKAN SEMENTARA UNTUK DEBUGGING
      console.log('📄 Halaman sengaja dibiarkan terbuka untuk debugging.');
    }
  }
};


