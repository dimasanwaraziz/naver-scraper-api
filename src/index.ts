import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { scrapeNaverHybrid } from './scraper';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/naver', async (req: Request, res: Response) => {
  const productUrl = req.query.productUrl as string;

  if (!productUrl) {
    return res.status(400).json({ error: 'productUrl query parameter is required.' });
  }

  if (!productUrl.includes('smartstore.naver.com')) {
    return res.status(400).json({ error: 'Invalid Naver SmartStore URL provided.' });
  }

  const startTime = Date.now();
  try {
    const data = await scrapeNaverHybrid(productUrl);
    const latency = (Date.now() - startTime) / 1000;
    console.log(`Request successful. Latency: ${latency.toFixed(2)}s`);

    res.status(200).json({
      success: true,
      latency: `${latency.toFixed(2)}s`,
      data: data
    });
  } catch (error: any) {
    const latency = (Date.now() - startTime) / 1000;
    console.error(`Request failed. Latency: ${latency.toFixed(2)}s. Error: ${error.message}`);

    res.status(500).json({
      success: false,
      latency: `${latency.toFixed(2)}s`,
      message: 'Failed to scrape product data.',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`API server is running at http://localhost:${PORT}`);
});
