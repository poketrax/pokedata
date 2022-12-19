import { scrapeEbay } from '../src/price-scrapper.js'
import { getSerebiiLastestExpantions, serebiiSets } from '../src/serebii-scrapper.js'
import { setDbFile, DB_FILE, getLatestExpansions, getLatestSeries } from "../src/database.js"
import * as fs from "fs"
import { expect } from 'chai';
import { describe, before, it} from 'mocha';

const TEST_DB = "./test-data.sql"

describe("Scrape data", () => {
    it("scrape serebii sets", async () => {
        await getSerebiiLastestExpantions(5);
        console.log(serebiiSets)
    })
})

describe("Scrape prices", () => {
    it("Scrape ebay price", async () => {
        let card = testCard();
        let raw = await scrapeEbay(card, "raw");
        let grade9 = await scrapeEbay(card, "grade9");
        let grade10 = await scrapeEbay(card, "grade10");
        console.log({ raw: raw, grade9: grade9, grade10: grade10 })
    })
})

describe("SQL Tests", () => {
    before(() => {
        if(fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB)
        fs.copyFileSync(DB_FILE, TEST_DB)
        setDbFile(TEST_DB)
    });
    
    it("should get Latest Expanation", async () => {
        let expansions = await getLatestExpansions(5);
        expect(expansions.length).to.equal(5);
    })

})

function testCard() {
    return {
        cardId: "SWSH09-Brilliant-Stars-Charizard-V-(Full-Art)-153",
        collection: "Buy List",
        variant: "Holofoil",
        paid: 0,
        count: 1,
        grade: "",
        idTCGP: 263872,
        name: "Charizard V (Full Art)",
        expIdTCGP: "SWSH09 Brilliant Stars",
        expName: "Brilliant Stars",
        expCardNumber: "153",
        expCodeTCGP: "SWSH09",
        rarity: "Ultra Rare",
        img: "https://product-images.tcgplayer.com/fit-in/437x437/263872.jpg",
        price: 37.46,
        description: "",
        releaseDate: "2022-02-25T00:00:00Z",
        energyType: "Fire",
        cardType: "Pokemon",
        pokedex: 6,
        variants: ["Holofoil"]
    }
}

