import * as jsdom from 'jsdom'
import * as stringSimilarity from "string-similarity";
import { expantionExistsInDB, getLatestSeries, upsertExpantion } from "./database.js"
import { downloadFile, normalizeSetName, logger } from './common.js';
import fetch from 'node-fetch';
import { Expansion } from './CardMeta.js';

const PMC_MARKETING_URL = "https://press.pokemon.com/en/Items/Schedule/Pokemon-Trading-Card-Game?types=3"
const PMC_CARD_DB_BASE_URL = "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/"

const UPDATE_SET = "UPDATE expansions SET releaseDate = $releaseDate WHERE name = $name"

export type PmcSet = {
    name: string,
    pmc_code: string,
    icon: string
}

export type PmcExpansion = {
    name: string,
    series: string,
    url: string,
    relDate: string
}

export let pmcDbSets = new Array<PmcSet>();
export let newsets = new Array<PmcExpansion>();

/**
 * Scrapes the PMC Card Database for the exp symbol
 */
async function scrapePmcCardDBExps() {
    let response = await fetch(PMC_CARD_DB_BASE_URL)
    let data = await response.text()
    const { window } = new jsdom.JSDOM(data)
    const series_search = window.document.getElementById("filterExpansions")
    const series_tag = series_search?.getElementsByTagName("fieldset")[0];

    if (series_tag == null) return;
    let exps_tags = series_tag.getElementsByTagName("li")
    for (let exp_tag of exps_tags) {
        let code = exp_tag.getElementsByTagName("input")[0].id
        let name = exp_tag.getElementsByTagName("span")[0].textContent ?? ""
        let icon_url = exp_tag.getElementsByTagName("i")[0].style.backgroundImage.replace("url(", "").replace(")", "");
        pmcDbSets.push({ name: name, pmc_code: code, icon: icon_url });
    }
}

/**
 * Scrape the PMC Press release page for logo icon, name, and release date, this is the first source of data
 * @returns 
 */
async function scrapPmcPressReleases(): Promise<PmcExpansion[]> {
    let response = await fetch(PMC_MARKETING_URL)
    let data = await response.text()
    let releases = new Array<PmcExpansion>()
    const { window } = new jsdom.JSDOM(data)
    const lauch_table = window.document.getElementsByTagName("tbody")[0];
    const rows = lauch_table.getElementsByTagName("tr")
    for (let i = 0; i < 10; i++) {
        let row = rows[i];
        //Conditions
        const product = row.getElementsByClassName("prod-name")[0]
        const _date = row.getElementsByClassName("td-date")[0]
        if (product == null || _date == null) continue;
        let epoch = Date.parse(_date.textContent ?? "")
        if (isNaN(epoch) === true) continue
        //Processing
        const date = new Date(epoch);
        let parts = product.textContent?.replace("Pokémon TCG", "").replace(":", "").trim().split('\—') ?? [];
        let name = ""
        let series = ""
        if (parts.length == 2) {
            series = parts[0];
            name = parts[1];
        } else {
            name = parts[0];
            series = await getLatestSeries();
        }
        releases.push(
            {
                name: name,
                series: series,
                url: "https://press.pokemon.com" + (product as HTMLAnchorElement).href,
                relDate: date.toISOString()
            }
        )
    }
    return releases;
}

/**
 * Get sets from PMC marketing website
 * @returns 
 */
async function getPmcExpansions(): Promise<PmcExpansion[]> {
    let pressRels: PmcExpansion[] = await scrapPmcPressReleases();
    for (let rel of pressRels) {
        newsets.push(rel)
    }
    return newsets;
}

/**
 * Get a PMC expantion by name
 * @param name 
 * @returns 
 */
async function getPMCExpansion(name: string): Promise<PmcExpansion> {
    if (newsets.length === 0) { await getPmcExpansions() }
    let set = newsets.find(
        set => {
            let conf = stringSimilarity.compareTwoStrings(normalizeSetName(set.name), normalizeSetName(name));
            logger.debug(`pmc: ${normalizeSetName(set.name)}, look: ${normalizeSetName(name)} ${conf}`)
            return conf > 0.5;
        }
    )
    return set;
}

/**
 * Updates the expantion with values from PMC
 * @param exp 
 * @returns 
 */
export async function updateExpansionPmc(exp: Expansion) {
    let pmcExp = await getPMCExpansion(exp.name)
    if (pmcExp == null) { logger.debug(`Could not find PMC set for name: ${exp.name}`); return }
    exp.releaseDate = pmcExp.relDate
    upsertExpantion(exp, UPDATE_SET)
}

/**
 * Get the expansion logo from the series logo from the indivdual marketing page
 * @param {string} name 
 * @param {string} marketingPage 
 * @returns 
 */
async function getExpLogo(name, marketingPage) {
    let response = await fetch(marketingPage)
    let data = await response.text()
    const { window } = new jsdom.JSDOM(data)
    const logo = (window.document.getElementsByClassName("productLogo")[0] as HTMLImageElement).src;
    downloadFile(logo, `./images/exp_logo/${name.replace(" ", "-")}.png`)
    return logo;
}

/**
 * Get expantion symbol 
 * @param {string} name 
 * @returns 
 */
async function getExpSymbol(name: string) {
    if (pmcDbSets.length == 0) {
        await scrapePmcCardDBExps()
    }
    let exp = pmcDbSets.find((exp) => stringSimilarity.compareTwoStrings(name, exp.name) > 0.7)
    if (exp != null) {
        downloadFile(exp.icon, `./images/exp_symb/${name.replace(" ", "-")}`)
        return exp.icon;
    } else {
        return ""
    }
}