// common/browser.ts
import pup from 'puppeteer';
import useProxy from '@lem0-packages/puppeteer-page-proxy';
import fs from 'fs';
import debug from './debug.js';
import { load } from 'cheerio';
import { linkToAsin } from './utils.js';

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
];

export async function initBrowser() {
  const config: Config = JSON.parse(fs.readFileSync('./config.json').toString());

  const browser = await pup.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: '/usr/bin/google-chrome-stable',  // ← ce chemin marchait avant
  });

  global.browser = browser;
  debug.log('Browser initialized (chemin système)', 'info');
}
export async function getPage(url: string) {
  if (url.includes('/dp/')) {
    url += url.includes('?') ? '&aod=1' : '?aod=1';
  }

  debug.log(`URL: ${url}`, 'info');

  const page = await global.browser.newPage();

  const uAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  await page.setUserAgent(uAgent);

  // Headers qui aident Amazon à ne pas bloquer
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });

  let proxy: string | null = null;
  if (fs.existsSync('proxylist.txt')) {
    const proxies = fs.readFileSync('proxylist.txt').toString().split('\n').filter(Boolean);
    if (proxies.length > 0) {
      proxy = proxies[Math.floor(Math.random() * proxies.length)];
    }
  }

  if (proxy) {
    debug.log('Selected proxy: ' + proxy, 'info');
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (!proxy?.startsWith('http')) proxy = 'https://' + proxy;
      await useProxy(req, proxy).catch(e => {
        debug.log('Failed to apply proxy', 'error');
      });
    });
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const html = await page.evaluate(() => document.body.innerHTML).catch(e => debug.log(e, 'error'));
  await page.close();

  if (!html) {
    debug.log('Failed to load page.', 'error');
    return null;
  }

  const $ = load(html);
  return $;
}