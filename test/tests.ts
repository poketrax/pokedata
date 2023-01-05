import {
    getLogoUrl,
    getSerebiiExpantion,
    getSerebiiLastestNormalExpantions,
    getSerebiiPokemon,
    getSerebiiSetCards
} from '../src/serebii-scrapper.js'
import {
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
    getPokemon,
    useTestDbFile,
} from "../src/database.js"
import {
    findSetFromTCGP,
    getTcgpCode,
    pullVariants,
    pullTcgpSetCards,
    tcgpCardSearch
} from "../src/tcgp-scrapper.js"
import { scrapeEbay } from '../src/price-scrapper.js'
import * as fs from "fs"
import { expect } from 'chai';
import { describe, before, it } from 'mocha';
import { URL } from 'url';
import { Expansion } from '../src/CardMeta.js'
import { Card } from '../src/Card.js'
import { formatExpNumber,setUpLogger } from '../src/common.js'

const UPDATE_SET = "UPDATE expansions SET numberOfCards = $numberOfCards, logoURL = $logoURL, symbolURL = $symbolURL WHERE name = $name"
const TEST_DB = "./test-data.sql"
const UPDATE_CARD =
  "UPDATE cards SET " +
  "idTCGP = $idTCGP, " +
  "expIdTCGP = $expIdTCGP, " +
  "rarity = $rarity, " +
  "cardType = $cardType, " +
  "expCodeTCGP = $expCodeTCGP, " +
  "releaseDate = $releaseDate, " +
  "description = $description, " +
  "variants = $variants " +
  "WHERE expCardNumber = $expCardNumber AND expName = $expName"


before(()=> {
    setUpLogger(true)
})

describe("Meta Tests", () => {
    it("should normalize Exp Num", () => {
        expect(formatExpNumber("TG40")).to.be.equal("TG40")
        expect(formatExpNumber("TG1")).to.be.equal("TG01")
        expect(formatExpNumber("1")).to.be.equal("001")
        expect(formatExpNumber("001")).to.be.equal("001")
        expect(formatExpNumber("011")).to.be.equal("011")
        expect(formatExpNumber("11")).to.be.equal("011")
        expect(formatExpNumber("SM11")).to.be.equal("SM011")
        expect(formatExpNumber("Evolving Skies1 / 225")).to.be.equal("001")
    })
})

describe("Scrape Serebii data", () => {
    let testSet = `https://www.serebii.net/card/silvertempest/`
    it("scrape serebii sets", async () => {
        return getSerebiiLastestNormalExpantions(5)
            .then((exps) => { expect(exps.length).to.be.equal(5) })
            .catch((e) => expect.fail(`Error scraping serebii ${e.stack}`))
    })
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
            .then((data) => { console.log(data[0]); expect(data.length).to.be.equal(exp.numberOfCards)})
            .catch((e) => expect.fail(`Error scraping serebii ${e.stack}`))
    })
    it("scrape serebii pokemon", async () => {
        return getSerebiiPokemon()
            .then((p) => {
                expect(p.length).is.greaterThan(1000)
                expect(p[0].name, JSON.stringify(p[0])).is.equal("Bulbasaur")
                expect(p[0].id).is.equal(1)
            })
            .catch((e) => expect.fail(`Error scraping serebii ${e.stack}`))
    })
})

describe("Test TCGP api fetch", () => {
    it("should get tcgp set names from give name", async () => {
        return findSetFromTCGP("Silver Tempest")
            .then((value) => expect(value, `returned value: ${JSON.stringify(value)}`).to.contain("swsh12-silver-tempest"))
            .catch((e) => expect.fail(`Error ${e.stack}`))
    })
    it("should get variants for a cards", async () => {
        return pullVariants("263872")
            .then((value) => expect(value, `returned value: ${JSON.stringify(value)}`).to.contain("Holofoil"))
            .catch((e) => expect.fail(`Error  ${e.stack}`))
    })
    it("should get tcgp code for a set name", async () => {
        return getTcgpCode("SWSH12 Silver Tempest")
            .then((value) => expect(value, `returned value: ${JSON.stringify(value)}`).to.be.equal("SWSH12"))
            .catch((e) => expect.fail(`Error ${e.stack}`))
    })
    it("should get tcgp cards from a given set", async () => {
        return pullTcgpSetCards(testSetReal())
            .then((value) => expect(value.length, `returned value: ${JSON.stringify(value.length)}`).to.be.greaterThan(200))
            .catch((e) => expect.fail(`Error  ${e.stack}`))
    }).timeout(120000)
    it("should get tcgp card via name and set", async () => {
        let card = testCard();
        return tcgpCardSearch(card.name, card.expName)
            .then((value) => expect(value?.name, `returned value: ${JSON.stringify(value)}`).to.be.equal(card.name))
            .catch((e) => expect.fail(`Error  ${e.stack}`))
    })
})

describe("Scrape ebay prices", () => {
    it("should scrape raw ebay price", async () => {
        let card = testCard();
        scrapeEbay(card, "raw").then(
            (data) => {
                expect(data).to.be.not.null;
                expect(data).to.be.a('number')
            }
        ).catch((e) => { expect.fail(`Error scraping ebay ${e.stack}`) })
    })
    it("should scrape grade 9 data", async () => {
        let card = testCard();
        scrapeEbay(card, "grade9").then(
            (data) => {
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
        useTestDbFile()
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
        let exp = testSet()
        upsertExpantion(exp, UPDATE_SET);
        expect(expantionExistsInDB(exp.name)).to.be.equal(true)
    })
    it("should update Expansion", () => {
        let exps = getLatestExpansions(5);
        exps[0].numberOfCards = 300
        upsertExpantion(exps[0], UPDATE_SET);
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
        upsertCard(newCard, UPDATE_CARD)
        expect(findCard(newCard.cardId).cardId).to.be.equal(newCard.cardId)
    })
    it("should update Card", () => {
        let oldCard = testCard()
        oldCard.variants = ["vmax"];
        upsertCard(oldCard, UPDATE_CARD)
        expect(findCard(oldCard.cardId).variants).to.include("vmax")
    })
    it("should find card by tcgpId", () => {
        let oldCard = testCard()
        expect(findTcgpCard(oldCard.idTCGP)?.cardId).to.be.equal(oldCard.cardId)
    })
    it("should get the lastest pokedex number", () => {
        expect(getHighestPokedexNumber()).to.be.greaterThan(800)
    })
    it("should insert pokedex value", () => {
        let id = "test"
        upsertPokemon("test", 100000)
        expect(getPokemon(id).name).to.be.equal("test")
    })
    it("should find pokedex value", () => {
        expect(getPokemon("Radiant Hisuian Sneasler").name).to.be.equal("Sneasler")
        expect(getPokemon("Hisuian Goodra VSTAR").name).to.be.equal("Goodra")
        expect(getPokemon("Giratina V").name).to.be.equal("Giratina")
        expect(getPokemon("Pikachu VMAX (Secret)").name).to.be.equal("Pikachu")
        expect(getPokemon("Hisuian Zoroark VSTAR (213) (Secret)").name).to.be.equal("Zoroark")
        expect(getPokemon("Inkay - 121/196").name).to.be.equal("Inkay")
        expect(getPokemon("Mr. Mime").name).to.be.equal("Mr. Mime")
        expect(getPokemon("Porygon-Z").name).to.be.equal("Porygon-Z")
    })
    it("should find the right exp", () => {
        expect(expantionExistsInDB("SM Promos")).to.be.equal("Sun & Moon Promos")
        expect(expantionExistsInDB("SWSH Promos")).to.be.equal("Sword & Shield Promos")
    })
})

function testSet(): Expansion {
    return {
        name: "test-1",
        series: "Sword & Shield",
        tcgName: "[\"test\"]",
        numberOfCards: 2,
        releaseDate: "2022-12-19T18:20:16+0000",
        logoURL: "",
        symbolURL: "",
    }
}

function testSetReal(): Expansion {
    return {
        name: "Silver Tempest",
        series: "Sword & Shield",
        tcgName: `["swsh12-silver-tempest","swsh12-silver-tempest-trainer-gallery"]`,
        numberOfCards: 2,
        releaseDate: "2022-12-19T18:20:16+0000",
        logoURL: "",
        symbolURL: "",
    }
}

function testCard(): Card {
    return {
        cardId: "SWSH09-Brilliant-Stars-Charizard-V-(Full-Art)-153",
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

