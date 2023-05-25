import * as jsdom from 'jsdom'
import fetch from 'node-fetch'
import { delay, logger, formatCardName } from '../common.js'

const raw = "-PSA -BGS -CGC"
const grade10 = "(PSA 10,BGS 10,CGC 10)"
const grade9 = "(PSA 9,BGS 9,CGC 9)"
const LH_BIN = "1"
const _SOP = "15"
const ebayUrl = "https://www.ebay.com/sch/i.html"

/**
 * Scrape ebay for price
 * @param card 
 * @param type (raw|grade9|grade10)
 * @returns 
 */
export async function scrapeEbay(card, type): Promise<number> {
    let url = new URL(ebayUrl)
    let name = formatCardName(card.name)
    switch (type) {
        case 'raw':
            url.searchParams.set("kw", `(${card.expName})+(${name})+${card.expCardNumber} ${raw} -Digital -Online`)
            break
        case 'grade9':
            url.searchParams.set("kw", `(${card.expName})+(${name})+${card.expCardNumber} +${grade9} -Digital -Online`)
            break
        case 'grade10':
            let kw10 =  `(${card.expName})+(${name})+${card.expCardNumber} +${grade10} -Digital -Online`
            url.searchParams.set("kw", kw10)
            break
    }
    url.searchParams.set("LH_BIN", LH_BIN)
    url.searchParams.set("_SOP", _SOP)

    let prices = [];
    logger.debug(`ebay link: ${url.toString()}`)
    let resp = await fetch(url.toString());
    let data = await resp.text()
    const { window } = new jsdom.JSDOM(data)
    const listings = window.document.getElementsByClassName("s-item__info");
    for (let listing of listings) {
        let raw_str = listing.getElementsByClassName("s-item__price")[0].innerHTML.replace("$", "");
        let price = parseFloat(raw_str)
        if (isNaN(price) === false) {
            prices.push(price)
        }
    }
    prices.splice(0, 1);
    prices.sort((a, b) => a - b);
    let midpoint = Math.floor(prices.length / 2);
    if (prices.length > 0) {
        return prices[midpoint];
    }
    return 0;
}

