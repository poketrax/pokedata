import { scrapeEbay } from '../src/price-scrapper.js'
import {
    getLogoUrl,
    getSerebiiLastestExpantions,
    serebiiSets,
    getSerebiiSetCards
} from '../src/serebii-scrapper.js'
import {
    setDbFile,
    DB_FILE,
    getLatestExpansions,
    getLatestSeries,
    upsertExpantion,
    expantionExistsInDB,
    upsertCard,
    findCard,
    findTcgpCard,
    getHighestPokedexNumber,
    upsertPokemon,
    getPokemon
} from "../src/database.js"
import {
    findSetFromTCGP, pullVariants
} from "../src/tcgp-scrapper.js"
import * as fs from "fs"
import { expect } from 'chai';
import { describe, before, it } from 'mocha';
import { URL } from 'url';

const TEST_DB = "./test-data.sql"

describe("Scrape Serebii data", () => {
    let testSet = `https://www.serebii.net/card/silvertempest/`
    it("scrape serebii sets", async () => {
        return getSerebiiLastestExpantions(5)
            .then((exps) => {expect(exps.length).to.be.equal(5)})
            .catch((e) => expect.fail(`Error scraping serebii ${e.stack}`))
    }).timeout(5000)
    it("scrape serebii logo url", async () => {
        return getLogoUrl(testSet).then((url) => { let _url = new URL(url) })
            .catch((e) => expect.fail(`Error scraping serebii ${e.stack}`))
    })
    it("scrape serebii cards", async () => {
        let exp = {
            name: "Silver Tempest",
            series: "Sword & Shield",
            tcgName: "[\"swsh12-silver-tempest\",\"swsh12-silver-tempest-trainer-gallery\"]",
            numberOfCards: 245,
            releaseDate: "2022-11-11T00:00:00Z",
            logoURL: "",
            symbolURL: "",
        }
       return getSerebiiSetCards(testSet, exp)
            .then((data) => {console.log(data);expect(data.length).to.be.equal(exp.numberOfCards)})
            .catch((e) => expect.fail(`Error scraping ebay ${e.stack}`))
    })
})

describe("Test TCGP api fetch", () => {
    it("should get tcgp set names from give name", async () => {
        return findSetFromTCGP("Silver Tempest")
            .then((value) => expect(value,`returned value: ${JSON.stringify(value)}`).to.contain("swsh12-silver-tempest"))
            .catch((e) => expect.fail(`Error scraping ebay ${e.stack}`))
    }).timeout(5000)
    it("should get variants for a cards", async () => {
        return pullVariants("263872")
            .then((value) => expect(value,`returned value: ${JSON.stringify(value)}`).to.contain("Holofoil"))
            .catch((e) => expect.fail(`Error scraping ebay ${e.stack}`))
    }).timeout(5000)
})

describe("Scrape prices", () => {
    it("should scrape raw ebay price", async () => {
        let card = testCard();
        scrapeEbay(card, "raw").then(
            (data) => {
                console.log(`Raw data: ${data}`)
                expect(data).to.be.not.null;
                expect(data).to.be.a('number')
            }
        ).catch((e) => { expect.fail(`Error scraping ebay ${e.stack}`) })
    })
    it("should scrape grade 9 data", async () => {
        let card = testCard();
        scrapeEbay(card, "grade9").then(
            (data) => {
                console.log(`Grade 9 data: ${data}`)
                expect(data).to.be.not.null;
                expect(data).to.be.a('number')
            }
        ).catch((e) => {
            expect.fail(`Error scraping ebay ${e.stack}`)
        })
    })
    it("should scrape grade 10 data", async () => {
        let card = testCard();
        scrapeEbay(card, "grade10").then(
            (data) => {
                console.log(`Grade 10 data: ${data}`)
                expect(data).to.be.not.null
                expect(data).to.be.a('number')
            }
        ).catch((e) => {
            expect.fail(`Error scraping ebay ${e.stack}`)
        })
    })
})

describe("SQL Tests", () => {
    before(() => {
        if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB)
        fs.copyFileSync(DB_FILE, TEST_DB)
        setDbFile(TEST_DB)
    });
    it("should get Latest Expanation", () => {
        let exps = getLatestExpansions(5);
        expect(exps.length).to.equal(5)
    })
    it("should get Lastest Series", () => {
        let series = getLatestSeries();
        expect(series).to.be.not.null
    })
    it("should insert Expansion and find it", () => {
        let exp = {
            name: "test-1",
            series: "Sword & Shield",
            tcgName: "[\'test\']",
            numberOfCards: 2,
            releaseDate: "2022-12-19T18:20:16+0000",
            logoURL: "",
            symbolURL: "",
        }
        upsertExpantion(exp);
        expect(expantionExistsInDB(exp.name)).to.be.equal(true)
    })
    it("should update Expansion", () => {
        let exps = getLatestExpansions(5);
        exps[0].numberOfCards = 300
        upsertExpantion(exps[0]);
        exps = getLatestExpansions(5);
        expect(exps[0].numberOfCards).to.be.equal(300)
    })
    it("should insert Card", () => {
        let newCard = {
            cardId: "test-card",
            collection: "Buy List",
            variant: "Holofoil",
            paid: 0,
            count: 1,
            grade: "",
            idTCGP: 263872,
            name: "Test Card",
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
        upsertCard(newCard)
        expect(findCard(newCard.cardId).cardId).to.be.equal(newCard.cardId)
    })
    it("should update Card", () => {
        let oldCard = testCard()
        oldCard.variants = ["vmax"];
        upsertCard(oldCard)
        expect(findCard(oldCard.cardId).variants).to.include("vmax")
    })
    it("should find card by tcgpId", () => {
        let oldCard = testCard()
        expect(findTcgpCard(oldCard.idTCGP).cardId).to.be.equal(oldCard.cardId)
    })
    it("should get the lastest pokedex number", () => {
        expect(getHighestPokedexNumber()).to.be.greaterThan(800)
    })
    it("should insert pokedex value", () => {
        let id = 100000
        upsertPokemon("test", id)
        expect(getPokemon(id).name).to.be.equal("test")
    })
    it("should update pokedex value", () => {
        let id = 100
        upsertPokemon("test", id)
        expect(getPokemon(id).name).to.be.equal("Voltorb")
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

