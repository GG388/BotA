/* eslint-disable indent */
import { ActivityType, Client } from 'discord.js'
import fs from 'fs'
import { addWatchlistItem, getWatchlist, removeWatchlistItem } from './watchlist.js'
import debug from './debug.js'
import { item, category, search } from './amazon.js' // garde les 3 imports
import { sendNotifications } from './notifications.js'

const config: Config = JSON.parse(fs.readFileSync('./config.json').toString())

export async function startWatcher(bot: Client) {
  const curRows = await getWatchlist()
  bot.user?.setActivity(`${curRows.length} items! | ${config.prefix}help`, {
    type: ActivityType.Watching,
  })

  setInterval(async () => {
    const rows = await getWatchlist()
    debug.log('Checking prices...')
    if (rows.length > 0) doCheck(bot, 0)
  }, config.minutes_per_check * 60 * 1000)
}

export async function doCheck(bot: Client, i: number) {
  const watchlist = await getWatchlist()
  if (i >= watchlist.length) return

  const item = watchlist[i]
  let result: NotificationData[] | null = null

  switch (item.type) {
    case 'link':
      result = await itemCheck(item as LinkItem)
      break
    case 'category':
      result = await categoryCheck(item as CategoryItem)
      break
    case 'query':
      result = await queryCheck(item as QueryItem)
      break
  }

  if (result && result.length > 0) {
    sendNotifications(bot, result)
  }

  // Passe au suivant avec un petit délai
  if (i < watchlist.length - 1) {
    setTimeout(() => {
      doCheck(bot, i + 1)
    }, (config?.seconds_between_check || 5) * 1000)
  }
}

// Fonction pour un lien produit (link)
async function itemCheck(product: LinkItem): Promise<NotificationData[] | null> {
  const newData = await item(product.link)
  if (!newData) return null

  const newPrice = parseFloat(newData.price?.replace(/[^0-9,.]/g, '').replace(',', '.') || '0') || -1

  // Met à jour le watchlist avec le nouveau prix
  if (newPrice !== product.lastPrice) {
    await removeWatchlistItem(product.link)
    await addWatchlistItem({
      ...product,
      lastPrice: newPrice,
    })
  }

  const underPriceLimit = product.priceLimit ? newPrice <= product.priceLimit : true

  if (newPrice !== -1 && underPriceLimit && product.lastPrice > newPrice) {
    return [{
      itemName: newData.fullTitle || 'N/A',
      oldPrice: product.lastPrice,
      newPrice,
      link: product.link,
      guildId: product.guildId,
      channelId: product.channelId,
      priceLimit: product.priceLimit || null,
      pricePercentage: product.pricePercentage || null,
      difference: product.difference || null,
      symbol: newData.symbol,
      image: newData.image,
      coupon: 0
    }]
  }
  return null
}

// Fonction pour une catégorie (on garde pour plus tard)
async function categoryCheck(cat: CategoryItem): Promise<NotificationData[] | null> {
  const newItems = await category(cat.link)
  if (!newItems) return null

  const notifications: NotificationData[] = []
  let total = 0

  const itemsToCompare = newItems.list.filter(ni =>
    cat.cache.find(o => o.asin === ni.asin)
  )

  itemsToCompare.forEach(item => {
    const matchingObj = cat.cache.find(o => o.asin === item.asin)
    if (!matchingObj || matchingObj.lastPrice === item.lastPrice) return

    total++
    if (item.lastPrice > matchingObj.lastPrice) {
      notifications.push({
        itemName: item.fullTitle,
        oldPrice: matchingObj.lastPrice,
        newPrice: item.lastPrice,
        link: item.fullLink,
        guildId: cat.guildId,
        channelId: cat.channelId,
        priceLimit: cat.priceLimit || null,
        pricePercentage: cat.pricePercentage || null,
        difference: cat.difference || null,
        symbol: item.symbol,
        image: item.image,
        coupon: 0
      })
    }
  })

  // Met à jour la cache dans le watchlist
  await removeWatchlistItem(cat.link)
  await addWatchlistItem({
    ...cat,
    cache: newItems.list
  })

  debug.log(`${total} item(s) changed in category`, 'debug')
  return notifications
}

// Fonction pour une recherche (query)
async function queryCheck(query: QueryItem): Promise<NotificationData[] | null> {
  const newItems = await search(query.query, config.tld)
  const notifications: NotificationData[] = []

  const itemsToCompare = newItems.filter(ni =>
    query.cache.find(o => o.asin === ni.asin)
  )

  itemsToCompare.forEach(item => {
    const matchingObj = query.cache.find(o => o.asin === item.asin)
    if (!matchingObj || matchingObj.lastPrice === item.lastPrice) return

    // Gestion du coupon
    const oldPriceWithCoupon = matchingObj.coupon > 0 ? matchingObj.lastPrice - matchingObj.coupon : matchingObj.lastPrice
    const newPriceWithCoupon = item.coupon > 0 ? item.lastPrice - item.coupon : item.lastPrice

    if (newPriceWithCoupon < oldPriceWithCoupon) {
      notifications.push({
        itemName: item.fullTitle,
        oldPrice: matchingObj.lastPrice,
        newPrice: newPriceWithCoupon,
        link: item.fullLink,
        guildId: query.guildId,
        channelId: query.channelId,
        priceLimit: query.priceLimit || null,
        pricePercentage: query.pricePercentage || null,
        difference: query.difference || null,
        symbol: item.symbol,
        image: item.image,
        coupon: item.coupon
      })
    }
  })

  // Met à jour la cache
  await removeWatchlistItem(query.query)
  await addWatchlistItem({
    ...query,
    cache: newItems
  })

  return notifications
}