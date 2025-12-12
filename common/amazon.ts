// common/amazon.ts
import puppeteer from 'puppeteer';
import { getPage } from './browser.js'; // garde ton helper existant
import debug from './debug.js';

export async function search(query: string, suffix: string) {
  const sanq = query.replace(/ /g, '+');
  const url = `https://www.amazon.${suffix}/s?k=${sanq}`;
  
  const $ = await getPage(url);
  const results: SearchData[] = [];
  const foundAsins: string[] = [];

  const items = $('.s-result-list .s-result-item');
  if (items.length === 0) return results;

  for (const el of items.toArray()) {
    const $el = $(el);
    
    const link = $el.find('.a-link-normal[href*="/dp/"]').first().attr('href');
    if (!link) continue;
    
    const asin = link.split('/dp/')[1]?.split('?')[0];
    if (!asin || foundAsins.includes(asin)) continue;
    foundAsins.push(asin);

    // Prix actuel
    const priceText = $el.find('.a-price .a-offscreen').first().text().trim();
    const price = priceText ? parseFloat(priceText.replace(/[^0-9,.]/g, '').replace(',', '.')) : null;

    // Coupon (si présent)
    const couponText = $el.find('.s-coupon-unclipped span').first().text().trim();
    let coupon = 0;
    if (couponText) {
      const pct = couponText.match(/(\d+)%/);
      if (pct) coupon = price ? price * (parseInt(pct[1]) / 100) : 0;
    }

    results.push({
      fullTitle: $el.find('span.a-text-normal').text().trim(),
      ratings: $el.find('.a-icon-alt').text().trim(),
      coupon,
      price: price ? price.toFixed(2) : '',
      lastPrice: price || 0,
      symbol: priceText.replace(/[0-9,.]/g, '') || '€',
      sale: $el.find('.a-text-price .a-offscreen').text().trim(),
      fullLink: `https://www.amazon.${suffix}/dp/${asin}`,
      image: $el.find('.s-image').attr('src'),
      asin,
    });
  }

  return results;
}

// Fonction item (page produit) – la plus importante pour les alertes
export async function item(url: string) {
  const $ = await getPage(url);
  if (!$) return null;

  // Prix actuel (plusieurs sélecteurs pour être sûr)
  let priceText = '';
  const selectors = [
    '#corePriceDisplay_desktop_feature_div .a-price-whole',
    '#corePrice_feature_div .a-price-whole',
    '#priceblock_ourprice',
    '#priceblock_saleprice',
    '.a-price .a-offscreen'
  ];

  for (const sel of selectors) {
    const txt = $(sel).first().text().trim();
    if (txt) {
      priceText = txt;
      break;
    }
  }

  const price = priceText ? parseFloat(priceText.replace(/[^0-9,.]/g, '').replace(',', '.')) : null;

  // Ancien prix (baisse)
  const oldPriceText = $('.a-price.a-text-price .a-offscreen').text().trim();
  const oldPrice = oldPriceText ? parseFloat(oldPriceText.replace(/[^0-9,.]/g, '').replace(',', '.')) : null;

  // Disponibilité
  const inStock = 
    $('#add-to-cart-button').length > 0 && !$('#add-to-cart-button').prop('disabled') ||
    $('#buy-now-button').length > 0 ||
    $('#availability .a-color-success').text().toLowerCase().includes('en stock');

  const product: ProductInfo = {
    fullTitle: $('#productTitle').text().trim(),
    fullLink: url,
    asin: linkToAsin(url),
    seller: $('#bylineInfo').text().trim(),
    price: price ? price.toFixed(2) : '',
    lastPrice: price || 0,
    symbol: priceText.replace(/[0-9,.]/g, '') || '€',
    shipping: $('#deliveryBlockMessage').text().trim() || 'N/A',
    rating: $('.a-icon-star .a-icon-alt').first().text().trim(),
    features: $('#feature-bullets li').map((_, el) => ` - ${$(el).text().trim()}`).get(),
    availability: inStock ? 'En stock' : 'Indisponible',
    image: $('#landingImage').attr('data-old-hires') || $('#imgBlkFront').attr('src') || '',
  };

  debug.log(`Produit ${product.fullTitle} → Prix: ${product.price} € | Stock: ${product.availability}`, 'debug');
  return product;
}

// Les autres fonctions (category, parseBook, parseItem) peuvent rester, mais elles seront moins utilisées