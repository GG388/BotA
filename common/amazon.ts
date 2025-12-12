// common/amazon.ts
import fs from 'fs'
import { CheerioAPI } from 'cheerio'
import { getPage } from './browser.js'
import debug from './debug.js'
import { linkToAsin, parseParams, priceFormat } from './utils.js'

const config: Config = JSON.parse(fs.readFileSync('./config.json').toString())

export async function search(query: string, suffix: string) {
  const sanq = query.replace(/ /g, '+')
  const url = `https://www.amazon.${suffix}/s?k=${sanq}`
  const results: SearchData[] = []
  const foundAsins: string[] = []
  const $ = await getPage(url)
  const limit = $('.s-result-list').find('.s-result-item').length
  if (!limit || limit === 0) return results
  $('.s-result-list').find('.s-result-item').each(function () {
    if (results.length >= limit) return
    const link = '/dp/' + $(this).find('.a-link-normal[href*="/dp/"]').first().attr('href')?.split('/dp/')[1].split('?')[0]
    if (!link || link.includes('undefined')) return
    const asin = linkToAsin(link)
    const priceString = $(this).find('.a-price').find('.a-offscreen').first().text().trim()
    const price = priceFormat($(this).find('.a-price').find('.a-offscreen').first().text().trim().replace(/[a-zA-Z]/g, ''))
    const maybeCoupon = priceFormat($(this).find('.s-coupon-unclipped span').first().text().trim().replace(/[a-zA-Z]/g, ''))
    const isPct = $(this).find('.s-coupon-unclipped span').first().text().trim().includes('%')
    if (foundAsins.includes(asin)) return
    foundAsins.push(asin)
    results.push({
      fullTitle: $(this).find('span.a-text-normal').text().trim(),
      ratings: $(this).find('.a-icon-alt').text().trim(),
      coupon: isPct ? parseFloat(price) * (parseFloat(maybeCoupon) / 100) : maybeCoupon.includes('NaN') ? 0 : parseFloat(maybeCoupon),
      price: price.includes('NaN') ? '' : price,
      lastPrice: parseFloat(price) || 0,
      symbol: priceString.replace(/[,.]+/g, '').replace(/[\d a-zA-Z]/g, ''),
      sale: $(this).find('.a-text-price').find('.a-offscreen').eq(1).text().trim(),
      fullLink: `https://www.amazon.${suffix}/dp/${asin}`,
      image: $(this).find('.s-image').attr('src'),
      asin
    })
  })
  return results
}

export async function category(url: string) {
  let node = url.split('node=')[1]
  if (node?.includes('&')) node = node.split('&')[0]
  let ie = url.split('ie=')[1]
  if (ie?.includes('&')) ie = ie.split('&')[0]
  const tld = url.split('amazon.')[1].split('/')[0]
  const path = url.split(tld + '/')[1].split('?')[0]
  const $ = await getPage(`https://www.amazon.${tld}/${path}/?ie=${ie}&node=${node}`).catch(e => {
    debug.log(e, 'error')
  })
  if (!$) return null
  debug.log('Detected category', 'debug')
  const categoryObj: Category = {
    name: $('.bxw-pageheader__title h1').text().trim(),
    link: url,
    list: [],
    node
  }
  const topRated = $('.octopus-best-seller-card .octopus-pc-card-content li.octopus-pc-item').toArray()
 
  categoryObj.list = topRated.map((el) => {
    const $el = $(el)
    const item = $el.find('.octopus-pc-item-link')
    const asin = item.attr('href').split('/dp/')[1].split('?')[0].replace(/\//g, '')
    const name = item.attr('title')
    const priceFull = $el.find('.octopus-pc-asin-price').text().trim()
    const price = priceFormat(priceFull.replace(/[a-zA-Z]/g, ''))
    return {
      fullTitle: name,
      fullLink: `https://amazon.${tld}/dp/${asin}/`,
      asin: asin,
      price: price.includes('NaN') ? '' : price,
      lastPrice: parseFloat(price) || 0,
      symbol: priceFull.replace(/[,.]+/g, '').replace(/[\d a-zA-Z]/g, ''),
      image: $el.find('.octopus-pc-item-image').attr('src'),
      node
    }
  })
  categoryObj.node = node
 
  return categoryObj
}

export async function item(url: string) {
  if (Object.keys(config.url_params).length > 0) {
    url += parseParams(config.url_params)
  }
  const $ = await getPage(url).catch(e => {
    debug.log(e, 'error')
  })
  if (!$) return null
  const category = $('#wayfinding-breadcrumbs_container').find('.a-list-item').find('a').text().trim().toLowerCase()
  let emptyVals = 0
  let item: ProductInfo
 
  switch (category) {
  case 'kindle store':
  case 'books':
    item = await parseBook($, url)
    break
  default:
    item = await parseItem($, url)
  }
  Object.keys(item).forEach((k: keyof ProductInfo) => {
    // @ts-ignore
    if(typeof item[k] === 'string' && item[k].length === 0) emptyVals++
  })
  if(emptyVals > 1) debug.log(`Detected ${emptyVals} empty values. Could potentially mean bot was flagged`, 'warn')
  return item
}

async function parseItem($: CheerioAPI, url: string): Promise<ProductInfo> {
  debug.log('Detected as a regular item', 'debug')
 
  let couponDiscount = 0
  if ($('label[id*="couponTextpctch"]').text().trim() !== '') {
    couponDiscount = parseInt($('label[id*="couponTextpctch"]').text().trim().match(/(\d+)/)[0], 10) || 0
  }
  const priceElms = [
    $('#corePriceDisplay_desktop_feature_div .a-offscreen').text().trim(),
    $('#corePrice_feature_div .a-offscreen').text().trim(),
    $('#priceblock_ourprice').text().trim(),
    $('#priceblock_saleprice').text().trim(),
    $('#sns-base-price').text().trim(),
    String(
      parseFloat(priceFormat($('#corePriceDisplay_desktop_feature_div').find('.a-price').find('.a-offscreen').eq(0).text().trim())) - couponDiscount
    ),
    String(
      parseFloat(priceFormat($('#corePriceDisplay_desktop_feature_div').find('.a-price-whole').