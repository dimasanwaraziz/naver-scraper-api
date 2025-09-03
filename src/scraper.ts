// src/scraper.ts

import axios from 'axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';
import UserAgent from 'user-agents';
import dotenv from 'dotenv';

// Terapkan plugin stealth ke puppeteer
puppeteer.use(StealthPlugin());
dotenv.config();
const randomDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

export const scrapeNaverProduct = async (productUrl: string) => {
  console.log(`Starting scrape for: ${productUrl}`);

  const urlRegex = /smartstore\.naver\.com\/([a-zA-Z0-9_-]+)\/products\/(\d+)/;
  const match = productUrl.match(urlRegex);
  if (!match) throw new Error('Invalid Naver SmartStore URL format.');

  const [, storeName, productId] = match;

  // PERUBAHAN DI SINI: Memastikan User-Agent adalah versi desktop
  const userAgent = new UserAgent({ deviceCategory: 'desktop' });

  // Cek apakah proxy dikonfigurasi di .env
  const useProxy = process.env.PROXY_HOST && process.env.PROXY_PORT;
  const axiosOptions: any = {
    headers: { 'User-Agent': userAgent.toString() },
    maxRedirects: 50
  };

  if (useProxy) {
    axiosOptions.proxy = {
      protocol: 'http',
      host: process.env.PROXY_HOST!,
      port: Number(process.env.PROXY_PORT!),
      auth: `${process.env.PROXY_USER!}:${process.env.PROXY_PASS!}`
    };
  }

  let channelUid = '';
  try {
    const pageResponse = await axios.get(productUrl, axiosOptions);

    const html = pageResponse.data;
    const channelMatch = html.match(/"channelUid":"([a-zA-Z0-9_=-]+)"/);

    if (!channelMatch) {
      console.log("Could not find channelUid. HTML might be a challenge page.");
      throw new Error('Could not find channelUid on the final page.');
    }

    channelUid = channelMatch[1];
    console.log(`✅ Successfully extracted channelUid: ${channelUid}`);
  } catch (error) {
    console.error('Failed to fetch initial page and get channelUid.', error);
    throw new Error('Could not retrieve channelUid.');
  }

  await randomDelay();

  const benefitsApiUrl = `https://smartstore.naver.com/benefits/by-product?productId=${productId}`;
  const productDetailsApiUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productId}?withWindow=false`;

  try {
    const [benefitsResponse, detailsResponse] = await Promise.all([
      axios.get(benefitsApiUrl, { ...axiosOptions, headers: { ...axiosOptions.headers, 'Referer': productUrl } }),
      axios.get(productDetailsApiUrl, { ...axiosOptions, headers: { ...axiosOptions.headers, 'Referer': productUrl } })
    ]);

    console.log('✅ Successfully fetched both API endpoints.');
    return {
      benefitsData: benefitsResponse.data,
      productDetailsData: detailsResponse.data
    };
  } catch (error) {
    console.error('Error during API scraping.', error);
    throw new Error('Failed to scrape one or both Naver APIs.');
  }
};


export const scrapeNaverProductWithPuppeteer = async (productUrl: string) => {
  console.log(`Starting Puppeteer scrape for: ${productUrl}`);

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      process.env.PROXY_HOST ? `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}` : ''
    ].filter(Boolean)
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });

    try {
      const cookiesString = await fs.readFile('./cookies.json');
      const cookies = JSON.parse(cookiesString.toString());

      for (let cookie of cookies) {
        if (cookie.expirationDate) {
          cookie.expires = cookie.expirationDate;
          delete cookie.expirationDate;
        }
        await page.setCookie(cookie);
      }
      console.log('✅ Cookies berhasil dimuat dari file.');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('File cookies.json tidak ditemukan, menjalankan sesi baru.');
      } else {
        console.error('Gagal memuat atau mengatur cookies dari file:', error.message);
      }
    }

    if (process.env.PROXY_USER) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS!
      });
    }

    await page.setUserAgent(new UserAgent({ deviceCategory: 'desktop' }).toString());

    console.log('Navigasi ke URL dengan referer...');
    await page.goto(productUrl, {
      waitUntil: 'networkidle2',
      referer: 'https://shopping.naver.com/'
    });

    await page.mouse.move(Math.random() * 800 + 100, Math.random() * 600 + 100, { steps: 10 });
    await randomDelay();
    await page.mouse.move(Math.random() * 800 + 100, Math.random() * 600 + 100, { steps: 10 });

    console.log('Navigasi selesai. Browser akan berhenti untuk debug.');

    // const currentCookies = await page.cookies();
    // await fs.writeFile('./cookies.json', JSON.stringify(currentCookies, null, 2));
    // console.log('✅ Cookies berhasil diperbarui/disimpan ke cookies.json');

    const preloadedState = await page.evaluate(() => {
      debugger;
      // @ts-ignore
      return window.__PRELOADED_STATE__;
    });

    if (!preloadedState || !(preloadedState.app?.channel?.channelUid || preloadedState.smartStoreV2?.channel?.channelUid)) {
      throw new Error('Could not find channelUid using Puppeteer.');
    }

    const channelUid = preloadedState.app?.channel?.channelUid || preloadedState.smartStoreV2.channel.channelUid;
    const productId = productUrl.match(/\/products\/(\d+)/)?.[1];

    console.log(`✅ Successfully extracted channelUid with Puppeteer: ${channelUid}`);

    return { channelUid, productId, preloadedState };

  } finally {
    // await browser.close(); 
  }
};


