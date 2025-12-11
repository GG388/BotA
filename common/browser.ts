import pup, { Browser } from 'puppeteer';
import useProxy from '@lem0-packages/puppeteer-page-proxy';
import fs from 'fs';
import debug from './debug.js';
import { load } from 'cheerio';
import { linkToAsin } from './utils.js';

const userAgents = [
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:75.0) Gecko/20100101 Firefox/75.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Ubuntu/14.04.6 Chrome/81.0.3990.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.3538.77 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.62 Safari/537.36 Edg/81.0.416.31'
];

export async function initBrowser() {
  const config: Config = JSON.parse(fs.readFileSync('./config.json').toString());

  const browser = await pup.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    // Sur Render Free, Chrome système existe ici :
    executablePath: '/usr/bin/google-chrome-stable',
  });

  global.browser = browser;
  debug.log('Browser initialized using system Chrome', 'info');
}

export async function getPage(url: string) {
  if (url.includes('/dp/')) {
    url += url.includes('?') ? '&aod=1' : '?aod=1';
  }

  debug.log(`URL: ${url}`, 'info');

  const page = await global.browser.newPage();
  const uAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  await page.setUserAgent(uAgent);

  let proxy: string | null = null;
  if (fs.existsSync('proxylist.txt')) {
    const proxies = fs.readFileSync('proxylist.txt').toString().split('\n');
    if (proxies.length > 0) {
      proxy = proxies[Math.floor(Math.random() * proxies.length)];
    }
  }

  if (proxy) {
    debug.log('Selected proxy URL: ' + proxy, 'info');
    await page.setRequestInterception(true);

    page.on('request', async (req) => {
      if (!proxy?.startsWith('http')) proxy = 'https://' + proxy;
      await useProxy(req, proxy).catch(e => {
        debug.log('Failed to apply proxy', 'error');
      });
    });
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  debug.log('Page loaded', 'info');

  const html = await page.evaluate(() => document.body.innerHTML).catch(e => debug.log(e, 'error'));
  await page.close();

  if (!html) {
    debug.log('Failed to load page.', 'error');
    return null;
  }

  const $ = load(html);
  return $;
}
