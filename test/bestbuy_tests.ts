import { expect } from 'chai';
import { describe, before, it } from 'mocha';
import { formatExpNumber,normalizeProductName,setUpLogger } from '../src/common.js'
import {SEARCH_BASE, getAllProductUrls, getProductUrls, } from '../src/scrappers/bestbuy-scrapper.js'

before(()=> {
    setUpLogger(true)
})
describe("Scrape bestbuy tests", () => {
    it("Get page urls", async () => {
        let urls = await getProductUrls(SEARCH_BASE)
        console.log(urls)
    }).timeout(60000)

    it("Get all urls", async () => {
        let urls = await getAllProductUrls()
        console.log(`total urls: ${urls.length}`)
    }).timeout(100000)

    it("test normalize", async () => {
        console.log(normalizeProductName("Pokemon TCG: blim blam"))
        console.log(normalizeProductName("Trading Card Game: blim blam"))
        console.log(normalizeProductName("Pokemon TCG: Trainer's Toolkit (2023)"))
        console.log(normalizeProductName("Scarlet & Violet Elite Trainer Box [Koraidon]"))
    })
}) 