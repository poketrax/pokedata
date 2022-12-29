import Database from 'better-sqlite3'
import type { Card } from './Card.js'
import type { Expansion } from './CardMeta.js'
import * as stringSimilarity from 'string-similarity'
import * as fs from 'fs'
import clc from 'cli-color'
import {logger} from './data-scrapper.js' 

export const DB_FILE = './databases/data.sqlite';
export const TEST_FILE = 'test-data.sql';

const SEARCH_SET = "SELECT * FROM expansions WHERE name like ?";
const ADD_SET = "INSERT INTO expansions (name, series, tcgName, numberOfCards, logoURL, symbolURL, releaseDate) " +
    "VALUES ($name, $series, $tcgName, $numberOfCards, $logoURL, $symbolURL, $releaseDate)";
const UPDATE_SET = "UPDATE expansions SET series = $series, tcgName = $tcgName, " +
    "numberOfCards = $numberOfCards, logoURL = $logoURL, symbolURL = $symbolURL, releaseDate = $releaseDate WHERE name = $name"

const ADD_CARD = "INSERT INTO cards (cardId, idTCGP, name, expIdTCGP, expCodeTCGP, expName, expCardNumber, rarity, img, price, description, releaseDate, energyType, cardType, variants) " +
    "VALUES ($cardId, $idTCGP, $name, $expIdTCGP, $expCodeTCGP, $expName, $expCardNumber, $rarity, $img, $price, $description, $releaseDate, $energyType, $cardType, $variants);"
const UPDATE_CARD = "UPDATE cards SET cardId = $cardId, idTCGP = $idTCGP, expIdTCGP = $expIdTCGP, cardType = $cardType, " +
    "expCodeTCGP = $expCodeTCGP, rarity = $rarity, variants = $variants, img = $img, description = $description, releaseDate = $releaseDate " +
    "WHERE expCardNumber = $expCardNumber AND expName = $expName"

let db = new Database(DB_FILE)

export function useTestDbFile(del?: boolean) {
    if (fs.existsSync(TEST_FILE) && del) {
        fs.rmSync(TEST_FILE);
        fs.copyFileSync(DB_FILE, TEST_FILE);
    }
    db = new Database(TEST_FILE)
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
 * @param exp 
 */
export function upsertExpantion(exp: Expansion) {
    let _exp = JSON.parse(JSON.stringify(exp))
    let db_exp = db.prepare(`SELECT * FROM expansions WHERE name = '${exp.name}'`).get()
    if (db_exp == null) {
        db.prepare(ADD_SET).run(_exp)
    } else {
        db.prepare(UPDATE_SET).run(_exp)
    }
    return db_exp;
}

/**
 * Upserts a card and returns the result of the upsert
 * @param card 
 * @returns Returns Card that is in the DB
 */
export function upsertCard(card: Card) {
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
        db.prepare(ADD_CARD).run(_card)
        logger.info(clc.green(`Adding : ${JSON.stringify(_card)}`))
    } else {
        db.prepare(UPDATE_CARD).run(_card)
        logger.info(clc.blackBright(`Updating : ${JSON.stringify(_card)}`))
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
    let card = db.prepare(`SELECT * FROM cards WHERE expName == $setName AND expCardNumber == $setNumber`)
        .get({ setName: setName, setNumber: setNumber })
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
export function expantionExistsInDB(name: string): boolean {
    let results = db.prepare(SEARCH_SET).get(name);
    let found = results == null ? false : true;
    if (found === false) {
        let exps = db.prepare(SEARCH_SET).all("%%");
        for (let exp of exps) {
            let confidence: number = stringSimilarity.compareTwoStrings(exp.name, name)
            if (confidence > 0.6) {
                logger.info(`Expantion ${name} already found with ${(confidence * 100).toFixed(0)}% confidence: ${exp.name}`)
                found = true;
            }
        }
    }
    return found;
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
        .replaceAll(/\([a-zA-Z\s0-9]+\)/g, "")
        .replaceAll(/[0-9]+\/[0-9]+/g, "")
        .trim()
    let pokemon = db.prepare("SELECT * from pokedex WHERE name = $name").get({ name: _name })
    return pokemon ?? {id: 10000, name: "Trainer"}
}

/**
 * Gets the latest Pokedex id in the database
 * @returns 
 */
export function getHighestPokedexNumber(): number {
    return db.prepare("SELECT id FROM pokedex ORDER BY id DESC LIMIT 1").get().id
}