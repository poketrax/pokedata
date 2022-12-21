import * as jsdom from 'jsdom'
import fetch from 'node-fetch'

const ebayUrl = "https://www.ebay.com/sch/i.html"
const raw = "-PSA -BGS -CGC"
const grade10 = "(PSA 10,BGS 10,CGC 10)"
const grade9 = "(PSA 9,BGS 9,CGC 9)"
const LH_BIN = "1"
const _SOP = "15"

export async function scrapeEbay(card, type) : Promise<number | undefined> {
    let url = new URL(ebayUrl)
    switch (type) {
        case 'raw':
            url.searchParams.set("kw", `${card.name} ${card.expCardNumber} ${raw} -Digital -Online`)
            break
        case 'grade9':
            url.searchParams.set("kw", `${card.name} ${card.expCardNumber} ${grade9} -Digital -Online`)
            break
        case 'grade10':
            url.searchParams.set("kw", `${card.name} ${card.expCardNumber} ${grade10} -Digital -Online`)
            break
    }
    url.searchParams.set("LH_BIN", LH_BIN)
    url.searchParams.set("_SOP", _SOP)

    let prices = [];
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
    prices.splice(0,1);
    prices.sort((a,b) => a - b);
    let midpoint = Math.floor(prices.length / 2);
    if(prices.length > 0){
        return prices[midpoint];
    }
    return null;
}