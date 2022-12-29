import fetch from "node-fetch"
import * as stringSimilarity from "string-similarity";
import * as jsdom from 'jsdom'
import type { Card } from "./Card.js";
import { Expansion } from "./CardMeta.js";
import { getExpNumber, getId, addCard, cardExpFolder } from "./common.js";
import { findCardComplex } from "./database.js";

export type SerebiiExpantion =
    {
        name: string,
        page: string,
        logo: string,
        symbol: string,
        numberOfCards: number
    }

export let serebiiNormalSets = new Array<SerebiiExpantion>();
export let serebiiPromoSets = new Array<SerebiiExpantion>();

/**
 * Get latest expansions from 
 * @param num 
 * @returns 
 */
async function scrapeSerebiiSets(num: number, url: string): Promise<SerebiiExpantion[]> {
    let res = await fetch(url);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let setTable: HTMLTableElement = window.document.getElementsByTagName("table")[0];
    let sets = new Array<SerebiiExpantion>();
    num++//increament since we start on row 1 to skip table headers
    for (let i = 1; i < num; i++) {
        let cells = setTable.rows[i].cells;
        let pageUrl = `https://www.serebii.net${(cells[0].children[0] as HTMLAnchorElement).href}`
        sets.push({
            name: cells[0].children[0].textContent.trim(),
            page: pageUrl,
            logo: await getLogoUrl(pageUrl),
            symbol: `https://www.serebii.net${(cells[2].children[0].children[0] as HTMLImageElement).src}`,
            numberOfCards: parseInt(cells[1].textContent),
        })
    }
    return sets
}

export async function getSerebiiLastestNormalExpantions(num: number) {
    let url = `https://www.serebii.net/card/english.shtml`
    if (serebiiNormalSets.length >= num) return serebiiNormalSets;
    serebiiNormalSets = await scrapeSerebiiSets(num, url);
    return serebiiNormalSets;
}

export async function getSerebiiLastestPromoExpantions(num: number) {
    let url = `https://www.serebii.net/card/engpromo.shtml`
    if (serebiiPromoSets.length >= num) return serebiiPromoSets;
    serebiiPromoSets = await scrapeSerebiiSets(num, url);
    return serebiiPromoSets;
}

/**
 * get serebii expansion by name
 * @param name 
 * @returns 
 */
export async function getSerebiiExpantion(name: string): Promise<SerebiiExpantion> {
    if (serebiiNormalSets.length <= 0) await getSerebiiLastestNormalExpantions(4);
    if (serebiiPromoSets.length <= 0) await getSerebiiLastestPromoExpantions(5);
    let set = serebiiNormalSets.find((set) => stringSimilarity.compareTwoStrings(set.name, name) > 0.7)
    if (set == null) { return serebiiPromoSets.find((set) => stringSimilarity.compareTwoStrings(set.name, name) > 0.7) }
    return set;
}

/**
 * Get logo 
 * @param setUrl 
 * @returns 
 */
export async function getLogoUrl(setUrl: string): Promise<string> {
    let res = await fetch(setUrl);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let logo: HTMLImageElement = window.document.getElementsByTagName("main")[0].getElementsByTagName("img")[0]
    return `https://www.serebii.net${logo.src}`;
}

/**
 * Get Serebii cards
 * @param setUrl 
 * @param set 
 * @returns 
 */
export async function getSerebiiSetCards(setUrl: string, set: Expansion): Promise<Card[]> {
    let res = await fetch(setUrl);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let table: HTMLTableElement = window.document.getElementsByClassName("dextable")[0];
    let rows = table.getElementsByTagName("tr")
    let cards = new Array<Card>();
    for (let i = 1; i < rows.length; i++) {
        let row = rows[i];
        if (row.cells.length !== 4) continue
        let rawNum = row.cells[0].textContent;
        rawNum = rawNum.replace(set.name, "")
        let cardNum = getExpNumber(rawNum.split("/")[0].trim());
        let rarity = parseRarity((row.cells[0].getElementsByTagName("img")[0] as HTMLImageElement))
        let img = `https://www.serebii.net${(row.cells[1].getElementsByTagName("img")[0] as HTMLImageElement).src}`.replace("/th", "")
        let name = row.cells[2].textContent.trim()
        let energy = parseEnergy(row.cells[3])
        let id = getId(set.name, name, cardNum)
        id = id.replaceAll(" ", "-")
        cards.push(
            {
                cardId: id.toString(),
                idTCGP: 0,
                name: name,
                expCodeTCGP: "",
                expIdTCGP: "",
                expName: set.name,
                expCardNumber: cardNum,
                rarity: rarity,
                img: img,
                energyType: energy
            }
        )
    }
    return cards;
}

export async function getSerebiiPokemon(): Promise<any[]> {
    let pokemon = [];
    let res = await fetch(`https://www.serebii.net/pokemon/nationalpokedex.shtml`);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let table: HTMLTableElement = window.document.getElementsByClassName("dextable")[0];
    let rows = table.rows
    for (let i = 2; i < rows.length; i++) {
        let row = rows[i];
        let number = parseInt(row.cells[0].textContent.replace("#", ""))
        let name = row.cells[2].textContent.trim()
        pokemon.push({ name: name, id: number })
    }
    return pokemon;
}

export async function serebiiUpsertCard(card: Card, exp: Expansion) {
    let dbCard = findCardComplex(exp.name, card.expCardNumber)
    //Case where img was already downloaded
    if (dbCard != null && dbCard.img === card.img) { await addCard(card); return }
    //Case where img has not been downloaded 
    if (dbCard != null) { dbCard.img = card.img; await addCard(dbCard, cardExpFolder(exp)); return }
    //Case where card is new
    await addCard(card, cardExpFolder(exp))
}

function parseRarity(img: HTMLImageElement): string {
    let imgSrc = img.src
    if (imgSrc.includes("common")) return "Common"
    if (imgSrc.includes("uncommon")) return "Uncommon"
    if (imgSrc.includes("holographic")) return "Holo Rare"
    if (imgSrc.includes("lvxrar")) return "Ultra Rare"
    return "Common"
}

function parseEnergy(cell: HTMLTableCellElement): string {
    let img = cell.getElementsByTagName("img")
    if (img.length === 0) return ""
    let raw = img[0].src
    if (raw.includes("grass")) return "Grass"
    if (raw.includes("fire")) return "Fire"
    if (raw.includes("water")) return "Water"
    if (raw.includes("electric")) return "Lightning"
    if (raw.includes("psychic")) return "Psychic"
    if (raw.includes("fighting")) return "Fighting"
    if (raw.includes("darkness")) return "Darkness"
    if (raw.includes("metal")) return "Metal"
    if (raw.includes("dragon")) return "Dragon"
    if (raw.includes("colorless")) return "Colorless"
    return ""
}