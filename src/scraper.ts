// src/scraper.ts
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import UserAgent from 'user-agents';
import dotenv from 'dotenv';

dotenv.config();

const proxyConfig = {
  host: process.env.PROXY_HOST!,
  port: Number(process.env.PROXY_PORT!),
  auth: {
    username: process.env.PROXY_USER!,
    password: process.env.PROXY_PASS!
  }
};

const proxyAgent = new HttpsProxyAgent(`http://${proxyConfig.auth.username}:${proxyConfig.auth.password}@${proxyConfig.host}:${proxyConfig.port}`);

const randomDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

export const scrapeNaverProduct = async (productUrl: string) => {
  console.log(`Starting scrape for: ${productUrl}`);

  const urlRegex = /smartstore\.naver\.com\/([a-zA-Z0-9_-]+)\/products\/(\d+)/;
  const match = productUrl.match(urlRegex);
  if (!match) {
    throw new Error('Invalid Naver SmartStore URL format.');
  }
  const [, storeName, productId] = match;

  const userAgent = new UserAgent();
  const headers = {
    'User-Agent': userAgent.toString(),
    'Accept': 'application/json, text/plain, */*',
    // 'Referer': productUrl
  };

  let channelUid = '';
  try {
    const pageResponse = await axios.get(productUrl, {
      insecureHTTPParser: true,
      maxRedirects: 0,
      headers: { 'User-Agent': userAgent.toString() },
      validateStatus: function(status) {
        return status >= 200 && status < 400;
      },
      proxy: {
        protocol: 'http',
        host: process.env.PROXY_HOST!,
        port: Number(process.env.PROXY_PORT!),
        auth: {
          username: process.env.PROXY_USER!,
          password: process.env.PROXY_PASS!
        }
      }
    });
    const html = pageResponse.data;
    const channelUidRegex = /"channelUid":"([a-zA-Z0-9_=-]+)"/;
    const channelMatch = html.match(channelUidRegex);
    if (!channelMatch) {
      throw new Error('Could not find channelUid on the product page.');
    }
    channelUid = channelMatch[1];
    console.log(`Successfully extracted channelUid: ${channelUid}`);
  } catch (error: any) {
    if (error.response && error.response.status >= 300 && error.response.status < 400) {
      console.log('Request was redirected!');
      console.log('Status:', error.response.status);
      console.log('Redirecting to:', error.response.headers.location); // INI YANG PENTING!
    } else {
      console.error('Failed to fetch product page to get channelUid', error.message);
    }
    throw new Error('Could not retrieve channelUid.');
  }

  await randomDelay();

  const benefitsApiUrl = `https://smartstore.naver.com/benefits/by-product?productId=${productId}`;
  const productDetailsApiUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productId}?withWindow=false`;

  console.log(`Fetching benefits from: ${benefitsApiUrl}`);
  console.log(`Fetching details from: ${productDetailsApiUrl}`);

  try {
    const [benefitsResponse, detailsResponse] = await Promise.all([
      axios.get(benefitsApiUrl, {
        headers,
        insecureHTTPParser: true,
        proxy: {
          protocol: 'http',
          host: process.env.PROXY_HOST!,
          port: Number(process.env.PROXY_PORT!),
          auth: {
            username: process.env.PROXY_USER!,
            password: process.env.PROXY_PASS!
          }
        }

      }),
      axios.get(productDetailsApiUrl, {
        headers,
        insecureHTTPParser: true,
        proxy: {
          protocol: 'http',
          host: process.env.PROXY_HOST!,
          port: Number(process.env.PROXY_PORT!),
          auth: {
            username: process.env.PROXY_USER!,
            password: process.env.PROXY_PASS!
          }
        }
      })
    ]);

    return {
      benefitsData: benefitsResponse.data,
      productDetailsData: detailsResponse.data
    };
  } catch (error) {
    console.error('Error during API scraping:', error);
    throw new Error('Failed to scrape one or both Naver APIs.');
  }
};
