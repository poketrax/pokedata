import fetch from "node-fetch";
import * as jsdom from "jsdom";
import * as stringSimilarity from "string-similarity";
import { RecentProduct } from "../model/SealedProduct.js";
import { logger, normalizeProductName } from "../common.js";
import { getSealedProducts } from "../database.js";
import clc from "cli-color";

export const SEARCH_BASE = "https://www.walmart.com/browse/toys/pokemon-cards/4171_4191_9807313_4252400?facet=retailer_type%3AWalmart";

export async function getRecentProducts(url: string): Promise<Array<RecentProduct>> {
  let products = new Array<RecentProduct>();
  let rawPage: string;
  try {
    rawPage = await (await fetch(url)).text();
    let { window } = new jsdom.JSDOM(rawPage, { runScripts: "dangerously" });
    let document = window.document;
    let prodBoxes = document.getElementsByClassName("mb0 ph1 pa0-xl bb b--near-white w-25")
    logger.debug(`Number of walmart products: ${prodBoxes.length}`)
    console.log(`Number of walmart products: ${prodBoxes.length}`)
  } catch (e) {
    logger.error(clc.red(`Failed to pull data from walmart. ${e}`));
  }
  return products;
}
