import fetch from "node-fetch"
import * as stringSimilarity from "string-similarity";
import * as jsdom from 'jsdom'
import type { Card } from "./Card.js";
import { Expansion } from "./CardMeta.js";

export type SerebiiExpantion =
    {
        name: string,
        page: string,
        logo: string,
        symbol: string,
        numberOfCards: number
    }

export let serebiiSets = new Array<SerebiiExpantion>();

/**
 * Get latest expansions from 
 * @param num 
 * @returns 
 */
export async function getSerebiiLastestExpantions(num: number) : Promise<SerebiiExpantion[]>{
    if (serebiiSets.length >= num) return serebiiSets;

    let res = await fetch(`https://www.serebii.net/card/english.shtml`);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let setTable: HTMLTableElement = window.document.getElementsByTagName("table")[0];

    for (let i = 1; i < num; i++) {
        let cells = setTable.rows[i].cells;
        let pageUrl = `https://www.serebii.net${(cells[0].children[0] as HTMLAnchorElement).href}`
        serebiiSets.push({
            name: cells[0].children[0].textContent,
            page: pageUrl,
            logo: await getLogoUrl(pageUrl),
            symbol: `https://www.serebii.net${(cells[2].children[0].children[0] as HTMLImageElement).src}`,
            numberOfCards: parseInt(cells[1].textContent),
        })
    }
    return serebiiSets;
}

/**
 * get serebii expansion by name
 * @param name 
 * @returns 
 */
export async function getSerebiiExpantion(name: string): Promise<SerebiiExpantion> {
    if (serebiiSets.length <= 0) { await getSerebiiLastestExpantions(6) };
    return serebiiSets.find((set) => stringSimilarity.compareTwoStrings(set.name, name) > 0.7)
}

/**
 * Get logo 
 * @param setUrl 
 * @returns 
 */
async function getLogoUrl(setUrl: string): Promise<string> {
    let res = await fetch(setUrl);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let logo: HTMLImageElement = window.document.getElementsByTagName("main")[0].getElementsByTagName("img")[0]
    return `https://www.serebii.net${logo.src}`;
}

export async function getSerebiiSetCards(setUrl: string, set: Expansion): Promise<Card[]> {
    let res = await fetch(setUrl);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let table : HTMLTableElement = window.document.getElementsByClassName("dextable")[0];
    let rows = table.getElementsByTagName("tr")
    let cards = new Array<Card>();
    for(let i = 1; i < rows.length; i ++){
        let row = rows[i];
        let rawNum = row.cells[0].textContent;
        let cardNum = rawNum.split("/")[0];
        let rarity = parseRarity((row.cells[0].getElementsByTagName("img")[0] as HTMLImageElement))
        let img = `https://www.serebii.net${(row.cells[1].getElementsByTagName("img")[0] as HTMLImageElement).src}`
        let name = getName(row.cells[2])
        let energy = parseEnergy(row.cells[3])
        let id = new String(`${set.name}-${name}-${cardNum}`)
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

function getName(cell : HTMLTableCellElement): string{
    let a = cell.getElementsByTagName("a")[0]
    let font = cell.getElementsByTagName("font")[0]
    return font.textContent + a.textContent
}

function parseRarity(img: HTMLImageElement): string{
    let imgSrc = img.src
    if(imgSrc.includes("common")) return "Common"
    if(imgSrc.includes("uncommon")) return "Uncommon"
    if(imgSrc.includes("holographic")) return "Holo Rare"
    if(imgSrc.includes("lvxrar")) return "Ultra Rare"
    return "Common"
}

function parseEnergy(cell: HTMLTableCellElement): string{
    let img = cell.getElementsByTagName("img")
    if(img == null) return ""
    let raw = img[0].src
    if(raw.includes("grass")) return "Grass"
    if(raw.includes("fire")) return "Fire"
    if(raw.includes("water")) return "Water"
    if(raw.includes("electric")) return "Lightning"
    if(raw.includes("psychic")) return "Psychic"
    if(raw.includes("fighting")) return "Fighting"
    if(raw.includes("darkness")) return "Darkness"
    if(raw.includes("metal")) return "Metal"
    if(raw.includes("dragon")) return "Dragon"
    if(raw.includes("colorless")) return "Colorless"
    return ""
}