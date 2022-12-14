import Database from 'better-sqlite3'
import type { Card } from './Card.js'
import type { Expansion } from './CardMeta.js'
import * as stringSimilarity from 'string-similarity'

const db = new Database('./databases/data.sqlite')
const SEARCH = "SELECT * FROM expansions WHERE name like ?";
const ADD_SET = "INSERT INTO expansions (name, series, tcgName, numberOfCards, logoURL, symbolURL, releaseDate) " +
    "VALUES ($name, $series, $tcgName, $numberOfCards, $logoURL, $symbolURL, $releaseDate)";
const UPDATE_SET = "UPDATE expansions SET series = $series, tcgName = $tcgName, "+
    "numberOfCards = $numberOfCards, logoURL = $logoURL, symbolURL = $symbolURL, releaseDate = $releaseDate WHERE name = $name"
const ADD_CARD = "INSERT INTO cards (cardId, idTCGP, name, expIdTCGP, expCodeTCGP, expName, expCardNumber, rarity, img, price, description, releaseDate, energyType, cardType, variants) " +
    "VALUES ($cardId, $idTCGP, $name, $expIdTCGP, $expCodeTCGP, $expName, $expCardNumber, $rarity, $img, $price, $description, $releaseDate, $energyType, $cardType, $variants);"
const UPDATE_CARD = "UPDATE cards SET expName = $expName, variants = $variants, img = $img, description = $description " +
    "WHERE cardId = $cardId"

/**
 * Get the latest (num) of expansions
 * @param num 
 * @returns 
 */
export async function getLatestExpansions(num: number) : Promise<Expansion[]>{
    return await db.prepare(`SELECT * FROM expansions ORDER BY datetime(releaseDate) DESC LIMIT ${num}`).all();
}

/**
 * Get Latest series in the database
 */
export async function getLatestSeries() : Promise<string>{
    let series = await db.prepare("SELECT * FROM series ORDER BY datetime(releaseDate) DESC LIMIT 1").get();
    if (series != null) {
        return series.name
    }
    return ""
}

export function upsertExpantion(exp: Expansion) {
    let _exp = JSON.parse(JSON.stringify(exp))
    if (db.prepare(`SELECT * FROM expansions WHERE name == '${exp.name}'`).get() == null) {
        db.prepare(ADD_SET).run(_exp)
    } else {
        db.prepare(UPDATE_SET).run(_exp)
    }
}

/**
 * Upsert card
 * @param card 
 */
export function updsertCard(card: Card) {
    let _card = JSON.parse(JSON.stringify(card))
    if (db.prepare(`SELECT * FROM cards WHERE cardId == '${card.cardId}'`).get() == null) {
        db.prepare(ADD_CARD).run(_card)
    } else {
        db.prepare(UPDATE_CARD).run(_card)
    }
}

/**
 * Check is the expantion exsists in the database
 * @param name 
 * @returns 
 */
export async function expantionExistsInDB(name: string): Promise<boolean> {
    let results = await db.prepare(SEARCH).get(name);
    let found = results == null ? false : true;
    if (found == false) {
        let exps = await db.prepare(SEARCH).all("%%");
        for (let exp of exps) {
            let confidence: number = stringSimilarity.compareTwoStrings(exp.name, name)
            if (confidence > 0.6) {
                console.log(`Expantion ${name} already found with ${(confidence * 100).toFixed(0)}% confidence: ${exp.name}`)
                found = true;
            }
        }
    }
    return found;
}
