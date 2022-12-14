import fetch from "node-fetch"
import * as stringSimilarity from "string-similarity";
import * as jsdom from 'jsdom'

export type SerebiiExpantion =
    {
        name: string,
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
export async function getSerebiiLastestExpantions(num: number) {
    if (serebiiSets.length >= num) return;

    let res = await fetch(`https://www.serebii.net/card/english.shtml`);
    let data = await res.text()
    const { window } = new jsdom.JSDOM(data)
    let setTable: HTMLTableElement = window.document.getElementsByTagName("table")[0];

    for (let i = 1; i < num; i++) {
        let cells = setTable.rows[i].cells;
        serebiiSets.push({
            name: cells[0].children[0].textContent,
            logo: await getLogoUrl(`https://www.serebii.net${(cells[0].children[0] as HTMLAnchorElement).href}`),
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