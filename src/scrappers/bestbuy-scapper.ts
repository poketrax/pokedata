import fetch from "node-fetch";
import * as jsdom from "jsdom";
import * as stringSimilarity from "string-similarity";
import { RecentProduct } from "../model/SealedProduct.js";
import { logger, normalizeProductName } from "../common.js";
import { getSealedProducts } from "../database.js";
import clc from 'cli-color'
export let SEARCH_BASE =
  "https://www.bestbuy.com/site/searchpage.jsp?_dyncharset=UTF-8&browsedCategory=pcmcat1604992984556&list=y&qp=brandcharacter_facet%3DFranchise~Pok%C3%A9mon&sc=Global&st=categoryid%24pcmcat1604992984556&type=page&usc=All%20Categories";

const COMP_THREASHOLD = 0.8
const COMP_LOG_THREASHOLD = 0.65

/**
 * This adds or updates the products provided and returns the total number of products found on bestbuy.com
 * @param products array to add products too
 * @returns number of total products found not insterted to products 
 */
export async function scrapeBestBuy(products: Array<RecentProduct>) : Promise<number> {
  let product_urls = await getAllProductUrls();
  let db_products = getSealedProducts("", 300);
  logger.info(`Found ${product_urls.length} products`)
  for(let url of product_urls){
    logger.debug(`Processing ${url}`)
    let product = await get_recent_product(url)
    let db_product = db_products.find((val) => {
      let normDbName = normalizeProductName(val.name)
      let comp = stringSimilarity.compareTwoStrings(product.name, normDbName);
      if (comp > COMP_LOG_THREASHOLD && comp < COMP_THREASHOLD){
        logger.warn(clc.yellow(`comp ratio very close: ${comp} ${normDbName} |||| ${product.name} `))
      }
      return comp > COMP_THREASHOLD
    } );
    if(db_product){
      product.name = db_product.name;
      let product_item = products.find((val) => val.name === db_product.name);
      if(product_item){
        logger.info(clc.magenta(`Updated recent product ${product.name}`))
        product_item.prices.push(product.prices[0]);
      }else{
        logger.info(clc.green(`Adding recent product ${product.name}`))
        products.push(product);
      }
    }else{
      logger.error(clc.red(`Failed to find match for ${product.name}`))
    }
  }
  return product_urls.length
}

export async function getAllProductUrls(): Promise<Array<string>> {
  let urls = new Array<string>();
  let searchPageRaw = await (await fetch(SEARCH_BASE)).text();
  const { window } = new jsdom.JSDOM(searchPageRaw);
  let pages = window.document.getElementsByClassName("page-item");
  let pageUrls = new Array<string>();
  for (let page of pages) {
    let a = page.getElementsByTagName("a");
    if (a.length !== 0) {
      let url: string = a[0].href;
      if (url.includes("http") === false) url = `https://www.bestbuy.com${url}`;
      pageUrls.push(url);
    }
  }
  pageUrls.push(SEARCH_BASE);
  logger.debug(`Found pages from bestbuy: ${JSON.stringify(pageUrls)}`);
  for (let pageUrl of pageUrls) {
    urls = urls.concat(await get_product_urls(pageUrl));
  }
  return urls;
}

export async function get_product_urls(page: string): Promise<Array<string>> {
  let urls = new Array<string>();
  logger.debug(`pulling page: ${page}`);
  let pageRaw = await (await fetch(page)).text();
  const { window } = new jsdom.JSDOM(pageRaw);
  let center_cols = window.document.getElementsByClassName("column-middle");
  logger.debug(`parsing ${center_cols.length} center columns`);
  for (let center of center_cols) {
    let variants = center.getElementsByClassName("c-carousel-list");
    if (variants.length != 0) {
      let links = variants[0].getElementsByTagName("a");
      for (let link of links) {
        urls.push(link.href);
      }
    } else {
      let title = center.getElementsByClassName("sku-title")[0];
      let link = title.getElementsByTagName("a");
      if (link.length != 0) {
        let url: string = link[0].href;
        if (url.includes("http") == false) url = `https://www.bestbuy.com${link[0].href}`;
        urls.push(url);
      }
    }
  }
  return urls;
}

export async function get_recent_product(url: string): Promise<RecentProduct>{
  let pageRaw = await (await fetch(url)).text();
  let { window } = new jsdom.JSDOM(pageRaw);
  let document = window.document;
  //price
  let priceHolder =  document.getElementsByClassName("priceView-hero-price")[0]
  let priceSpan = priceHolder.getElementsByTagName("span")
  let price = parseFloat(priceSpan[0].textContent.replace("$",""));
  //sales
  let saleHolder = document.getElementsByClassName("pricing-price__savings-regular-price")
  let sale = saleHolder.length !== 0;
  logger.debug(`sale: ${sale}`)
  //name
  let name_raw: string = document.getElementsByTagName("h1")[0].textContent;
  logger.debug(`Spec items : ${name_raw}`)
  let name_parts = name_raw.split(" - ")
  let name = normalizeProductName(name_parts.length === 1 ? name_parts[0]: name_parts[1])

  let vendor = {
        vendor: "bestbuy",
        link: url,
        sale: sale,
        price: price
    }
    let product = {
        name: name,
        prices: [vendor]
    }
    return product
}