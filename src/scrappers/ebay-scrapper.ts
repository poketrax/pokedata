import * as jsdom from "jsdom";
import fetch from "node-fetch";
import { delay, logger, formatCardName } from "../common.js";
import clc from "cli-color";

const raw = "-PSA -BGS -CGC";
const grade10 = "(PSA 10,BGS 10,CGC 10)";
const grade9 = "(PSA 9,BGS 9,CGC 9)";
const LH_BIN = "1";
const _SOP = "15";
const ebayUrl = "https://www.ebay.com/sch/i.html";

/**
 * Scrape ebay for price
 * @param card
 * @param type (raw|grade9|grade10)
 * @returns
 */
export async function scrapeEbay(card, type): Promise<number> {
  let url = new URL(ebayUrl);
  let name = formatCardName(card.name);

  switch (type) {
    case "raw":
      let kw = `(${card.expName})+(${name})+${card.expCardNumber} ${raw} -Digital -Online`;
      logger.info(`ebay raw search: ${kw}`);
      url.searchParams.set("kw", kw);
      break;
    case "grade9":
      let kw9 = `(${card.expName})+(${name})+${card.expCardNumber} +${grade9} -Digital -Online`;
      url.searchParams.set("kw", kw9);
      logger.info(`ebay raw search: ${kw9}`);
      break;
    case "grade10":
      let kw10 = `(${card.expName})+(${name})+${card.expCardNumber} +${grade10} -Digital -Online`;
      logger.info(`ebay raw search: ${kw10}`);
      url.searchParams.set("kw", kw10);
      break;
  }
  url.searchParams.set("LH_BIN", LH_BIN);
  url.searchParams.set("_SOP", _SOP);

  let prices = [];
  let resp = await fetch(url.toString());
  let data = await resp.text();
  const { window } = new jsdom.JSDOM(data);
  const listings = window.document.getElementsByClassName("s-item__info");
  if(listings === 0 ) logger.warn(`No listings found :( ${url.toString()}`)
  for (let listing of listings) {
    let raw_str: string = listing.getElementsByClassName("s-item__price")[0].innerHTML.toString();
    let parts = [ ...raw_str.matchAll(/(.*)\$(\d+\.\d{2})(.*)/g)];
    let match = parts[0];
    let raw_price = match[2];
    let price = parseFloat(raw_price ?? "");
    if (isNaN(price) === false) {
      prices.push(price);
    }else {
      logger.warn(`Price was NaN sounds SUS result:\n ${raw_str},\n${raw_price},\n${url.toString()}`)
    }
  }
  prices.splice(0, 1);
  prices.sort((a, b) => a - b);
  let midpoint = Math.floor(prices.length / 2);
  if (prices.length > 0) {
    return prices[midpoint];
  }
  logger.warn(clc.yellow(`Found no prices for ${card.name}, ${type}`));
  return 0;
}
