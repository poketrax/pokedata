import Database from 'better-sqlite3'
import type { Card, Price } from './model/Card.js'
import { Expansion } from './model/CardMeta.js'
import * as stringSimilarity from 'string-similarity'
import { normalizeSetName, logger, cardExpFolder } from './common.js'
import { PRICE_LIMIT } from './price-scrapper.js'
import * as fs from 'fs'
import clc from 'cli-color'

export const DB_FILE = './databases/data.sqlite';
export const TEST_FILE = 'test-data.sqlite';

export const PRICE_DB_FILE = './databases/prices.sqlite'
export const PRICE_TEST_FILE = 'test-prices.sqlite'

const SEARCH_SET = "SELECT * FROM expansions WHERE name like ?";
const ADD_SET = "INSERT INTO expansions " +
    "(name, series, tcgName, numberOfCards, logoURL, symbolURL, releaseDate) " +
    "VALUES ($name, $series, $tcgName, $numberOfCards, $logoURL, $symbolURL, $releaseDate)";
const ADD_CARD = "INSERT INTO cards " +
    "(cardId, idTCGP, name, expIdTCGP, expCodeTCGP, expName, expCardNumber, rarity, img, price, description, releaseDate, energyType, cardType, variants) " +
    "VALUES ($cardId, $idTCGP, $name, $expIdTCGP, $expCodeTCGP, $expName, $expCardNumber, $rarity, $img, $price, $description, $releaseDate, $energyType, $cardType, $variants);"
const ADD_PRICE = "INSERT INTO prices " +
    "(date, cardId, variant, rawPrice, gradedPriceTen, gradedPriceNine) " +
    "VALUES ($date, $cardId, $variant, $rawPrice, $gradedPriceTen, $gradedPriceNine)"

let dryrun = false
let db = new Database(DB_FILE)
let pricedb = new Database(PRICE_DB_FILE)

export function useTestDbFile(del?: boolean) {
    dryrun = true;
    if (fs.existsSync(TEST_FILE) && del) {
        fs.rmSync(TEST_FILE);
        fs.copyFileSync(DB_FILE, TEST_FILE);
    }
    if (fs.existsSync(PRICE_TEST_FILE) && del) {
        fs.rmSync(PRICE_TEST_FILE);
        fs.copyFileSync(PRICE_DB_FILE, PRICE_TEST_FILE);
    }
    db = new Database(TEST_FILE)
    pricedb = new Database(PRICE_TEST_FILE)
}

function resetCardDB(){
    db.close()
    if(dryrun){
        db = new Database(TEST_FILE)
    }else{
        db = new Database(DB_FILE)
    }
}

function resetPricesDB(){
    pricedb.close()
    if(dryrun){
        pricedb = new Database(PRICE_TEST_FILE)
    }else{
        pricedb = new Database(PRICE_DB_FILE)
    }
}

/**
 * Get expansion
 * @param num 
 * @returns 
 */
export function getExpansion(name: string): Expansion {
    return db.prepare(`SELECT * FROM expansions WHERE name = $name`).get({ name: name });
}

/**
 * Get the latest (num) of expansions
 * @param num 
 * @returns 
 */
export function getLatestExpansions(num: number): Expansion[] {
    return db.prepare(`SELECT * FROM expansions ORDER BY datetime(releaseDate) DESC LIMIT ${num}`).all();
}

/**
 * Get Latest series in the database
 */
export function getLatestSeries(): string {
    let series = db.prepare("SELECT * FROM series ORDER BY datetime(releaseDate) DESC LIMIT 1").get();
    if (series != null) {
        return series.name
    }
    return ""
}

/**
 * Upsert an expansion to the database
 * @param exp expantion to update
 * @param update update statement
 */
export function upsertExpantion(exp: Expansion, update: string) {
    let _exp = JSON.parse(JSON.stringify(exp))
    let db_exp = db.prepare(`SELECT * FROM expansions WHERE name = '${exp.name}'`).get()
    if (db_exp == null) {
        logger.info(clc.greenBright(`Adding new set ${JSON.stringify(exp)}`))
        db.prepare(ADD_SET).run(_exp)
    } else {
        logger.info(clc.magenta(`Updating set ${JSON.stringify(exp)}`))
        db.prepare(update).run(_exp)
    }
    return db_exp;
}

/**
 * Upserts a card and returns the result of the upsert
 * @param card 
 * @param
 * @returns Returns Card that is in the DB
 */
export function upsertCard(card: Card, update: string) {
    let _card = {
        cardId: card.cardId,
        idTCGP: card.idTCGP,
        name: card.name,
        expIdTCGP: card.expIdTCGP,
        expName: card.expName,
        expCardNumber: card.expCardNumber,
        expCodeTCGP: card.expCodeTCGP,
        rarity: card.rarity,
        img: card.img,
        price: card.price,
        description: card.description,
        releaseDate: card.releaseDate,
        energyType: card.energyType,
        cardType: card.cardType,
        pokedex: card.pokedex,
        variants: JSON.stringify(card.variants)
    }
    if (findCardComplex(card.expName, card.expCardNumber) == null) {
        try {
            db.prepare(ADD_CARD).run(_card)
            logger.info(clc.green(`Adding : ${JSON.stringify(_card)}`))
        } catch (e) {
            logger.error(clc.red(`Failed to Add : ${JSON.stringify(_card)}`))
        }
    } else {
        try {
            db.prepare(update).run(_card)
            logger.info(clc.magenta(`Updating : ${JSON.stringify(_card)}`))
        } catch (e) {
            logger.error(clc.red(`Failed to Update : ${JSON.stringify(_card)}`))
            logger.error(clc.red(e.stack))
        }
    }
}

/**
 * Get Card with provided TCGP id
 * @param tcgpId 
 * @returns 
 */
export function findTcgpCard(tcgpId: number): Card | null {
    let card = db.prepare(`SELECT * FROM cards WHERE idTCGP = $idTCGP`).get({ idTCGP: tcgpId.toFixed(0) })
    if (card == null) return null;
    let _card = {
        cardId: card.cardId,
        idTCGP: card.idTCGP,
        name: card.name,
        expIdTCGP: card.expIdTCGP,
        expName: card.expName,
        expCardNumber: card.expCardNumber,
        expCodeTCGP: card.expCodeTCGP,
        rarity: card.rarity,
        img: card.img,
        price: card.price,
        description: card.description,
        releaseDate: card.releaseDate,
        energyType: card.energyType,
        cardType: card.cardType,
        pokedex: card.pokedex,
        variants: JSON.parse(card.variants)
    }
    return _card;
}

/**
 * find card via card-id
 * @param id 
 * @returns 
 */
export function findCardComplex(setName: string, setNumber: string): Card | undefined {
    let card = db.prepare(`SELECT * FROM cards WHERE expName = $setName AND (expCardNumber = $setNumber OR expCardNumber = $deNormSetNumber)`)
        .get({ setName: setName, setNumber: setNumber, deNormSetNumber: setNumber.replaceAll("0", "") })
    if (card == null) return null;
    let _card = {
        cardId: card.cardId,
        idTCGP: card.idTCGP,
        name: card.name,
        expIdTCGP: card.expIdTCGP,
        expName: card.expName,
        expCardNumber: card.expCardNumber,
        expCodeTCGP: card.expCodeTCGP,
        rarity: card.rarity,
        img: card.img,
        price: card.price,
        description: card.description,
        releaseDate: card.releaseDate,
        energyType: card.energyType,
        cardType: card.cardType,
        pokedex: card.pokedex,
        variants: JSON.parse(card.variants)
    }
    return _card
}

/**
 * find card via card-id
 * @param id 
 * @returns 
 */
export function findCard(id: string): Card {
    let card = db.prepare(`SELECT * FROM cards WHERE cardId LIKE $id`).get({ id: `%${id}%` })
    if (card == null) return null;
    let _card = {
        cardId: card.cardId,
        idTCGP: card.idTCGP,
        name: card.name,
        expIdTCGP: card.expIdTCGP,
        expName: card.expName,
        expCardNumber: card.expCardNumber,
        expCodeTCGP: card.expCodeTCGP,
        rarity: card.rarity,
        img: card.img,
        price: card.price,
        description: card.description,
        releaseDate: card.releaseDate,
        energyType: card.energyType,
        cardType: card.cardType,
        pokedex: card.pokedex,
        variants: JSON.parse(card.variants)
    }
    return _card
}

/**
 * Check is the expantion exsists in the database
 * @param name 
 * @returns 
 */
export function expantionExistsInDB(name: string): string | undefined {
    let results = db.prepare(SEARCH_SET).get(name);
    let found = results == null ? false : true;
    if (found === false) {
        let exps = db.prepare(SEARCH_SET).all("%%");
        let matches = []
        for (let exp of exps) {
            let confidence: number = stringSimilarity.compareTwoStrings(normalizeSetName(exp.name), normalizeSetName(name))
            if (confidence > 0.6) {
                logger.info(`Expantion ${name} already found with ${(confidence * 100).toFixed(0)}% confidence: ${exp.name}`)
                matches.push({ name: exp.name, conf: confidence })
            }
        }
        matches.sort((a, b) => b.conf - a.conf)
        if (matches.length != 0) return matches[0].name;
    }
    return results == null ? null : results.name;
}

/**
 * Upserts a pokemon into the pokedex
 * @param name 
 * @param id 
 */
export function upsertPokemon(name: string, id: number) {
    let pokemon = db.prepare("SELECT * FROM pokedex WHERE id == $id").get({ id: id });
    if (pokemon == null) {
        db.prepare("INSERT INTO pokedex (id, name) values ($id, $name)").run({ id: id, name: name });
        logger.info(clc.green(`Add: ${JSON.stringify({ id: id, name: name })}`))
    }
}

/**
 * Get Pokemon by dex value
 * @param id 
 * @returns 
 */
export function getPokemon(name: string) {
    let _name = name
        .replaceAll(/VMAX|VSTAR| - |Origin Forme|Radiant|Hisuian|Alolan|Paldean|Galarian/g, "")
        .trim()
        .replaceAll(" V", "")
        .replaceAll(/\([a-zA-Z\s0-9]+\)/g, "")
        .replaceAll(/[0-9]+\/[0-9]+/g, "")
        .trim()
    let pokemon = db.prepare("SELECT * from pokedex WHERE name = $name").get({ name: _name })
    return pokemon ?? { id: 10000, name: "Trainer" }
}

/**
 * Gets the latest Pokedex id in the database
 * @returns 
 */
export function getHighestPokedexNumber(): number {
    return db.prepare("SELECT id FROM pokedex ORDER BY id DESC LIMIT 1").get().id
}

/**
 * Get Latest Price from a card
 * @param cardId 
 * @returns 
 */
export function getLatestPrice(cardId: string) {
    return pricedb.prepare("SELECT * FROM prices WHERE cardId = $cardId ORDER BY date(date)").get({ cardId: cardId })
}

/**
 * Upsert Price
 * @param price 
 */
export function upsertPrice(price: Price) {
    pricedb.prepare(ADD_PRICE).run(price)
}

/**
 * Get cards between these to dates 
 * @param start start time exclusive
 * @param end end time exclusive 
 * @param rare only pull rare cards
 * @returns 
 */
export function getCardsByDate(start: Date, end: Date, rare: boolean): Array<Card> {
    let query = `SELECT * FROM cards ` +
        `WHERE date(releaseDate) > date($start) AND date(releaseDate) < date($end) `
    if (rare) query += `AND rarity NOT IN ('Common', 'Uncommon') `
    query += `LIMIT ${PRICE_LIMIT}`
    return db.prepare(query).all({ start: start.toISOString(), end: end.toISOString() })
}

/**
 * 
 * @param cardId 
 * @returns 
 */
export function getPrice(cardId: string): Price {
    let query = 'SELECT * FROM prices WHERE cardId = $cardId'
    return pricedb.prepare(query).get({cardId: cardId})
}

/**
 * Complex query for prices
 * @param relStart Start of range for release date of card
 * @param relEnd End of range for release date of card
 * @param priceFilter Filters out and results after this date
 * @param rare Only rare cards
 * @returns 
 */
export function getPricesComplex(relStart: Date, relEnd: Date, priceFilter: Date, rare?: boolean): any[] {
    db.close();
    let sqlAttach = `ATTACH DATABASE '${DB_FILE}' AS cardDB;`
    let query =
        `SELECT * FROM (
            SELECT max(date) as date, prices.cardId, variant, rawPrice, gradedPriceNine, gradedPriceTen, 
            idTCGP, name, expIdTCGP, expName, expCardNumber, rarity, releaseDate
            FROM prices
            INNER JOIN cardDB.cards ON prices.cardId = cards.cardId
            WHERE date(cards.releaseDate) > date($relStart) 
            AND date(cards.releaseDate) < date($relEnd) `
    if (rare) query += `AND rarity NOT IN ('Common', 'Uncommon') `
    query += `GROUP BY prices.cardId ) `
    query += 'WHERE date(date) < date($priceFilter) '
    query += `LIMIT ${PRICE_LIMIT}`
    logger.debug(`SQL prices complex statement :\n${query}`)
    pricedb.prepare(sqlAttach).run();
    let results = pricedb.prepare(query).all(
        {
            relStart: relStart.toISOString(),
            relEnd: relEnd.toISOString(),
            priceFilter: priceFilter.toISOString()
        }
    )
    resetCardDB();
    resetPricesDB();
    return results
}