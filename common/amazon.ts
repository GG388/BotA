// common/amazon.ts
import { getPage } from './browser.js';
import debug from './debug.js';
import { linkToAsin } from './utils.js';

// Fonction search (gardée pour le watcher – tu pourras la réimplémenter plus tard)
export async function search(query: string, suffix: string) {
  debug.log('Fonction search appelée (non implémentée pour l’instant)', 'warn');
  return [];
}

// Fonction category (gardée pour le watcher)
export async function category(url: string) {
  debug.log('Fonction category appelée (non implémentée pour l’instant)', 'warn');
  return null;
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
    ($('#add-to-cart-button').length > 0 && !$('#add-to-cart-button').prop('disabled')) ||
    ($('#buy-now-button').length > 0) ||
    ($('#availability .a-color-success').text().toLowerCase().includes('en stock'));

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