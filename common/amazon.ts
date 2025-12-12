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
    // prevent duplicates
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
  // Get parsed page with puppeteer/cheerio
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
  const topRated = $('.oct