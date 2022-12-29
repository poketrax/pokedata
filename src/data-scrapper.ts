import * as fs from 'fs'
import clc from 'cli-color'
import minimist from 'minimist'
import { Expansion } from "./CardMeta.js"
import { getPMCExpansion } from './pmc-scrapper.js'
import { findSetFromTCGP, pullTcgpSetCards, tcgpUpsertCard } from './tcgp-scrapper.js'
import {
    consoleHeader,
    downloadFile,
    setUpLogger,
    getLogger
} from "./common.js"
import {
    getLatestExpansions,
    upsertExpantion,
    getLatestSeries,
    expantionExistsInDB,
    useTestDbFile,
    getHighestPokedexNumber,
    upsertPokemon,
} from './database.js';
import {
    getSerebiiLastestNormalExpantions,
    getSerebiiExpantion,
    getSerebiiPokemon,
    getSerebiiSetCards,
    serebiiUpsertCard
} from './serebii-scrapper.js'
import { Category } from 'typescript-logging-category-style'

type MetaData = {
    data: number,
    prices_high_res: number,
    prices_low_res: number
}

export const COUNT = 4
export let logger: Category;

let metaData: MetaData = JSON.parse(fs.readFileSync("./meta.json", "utf-8"));
let args: minimist.ParsedArgs;

run();

async function run() {
    args = minimist(process.argv.slice(2), {
        boolean: ['dryrun', 'fresh', 'verbose'],
        alias: { d: 'dryrun', f: 'fresh', v: 'verbose' }
    })
    setUpLogger(args.v);
    logger = getLogger("data-scraper");
    if (args.d) {
        useTestDbFile(args.f)
        logger.info(clc.red.bold(`------------------ DRYRUN --------------------`))
        logger.info(clc.red.bold(`--------- Results at test-data.sql -----------`))
        logger.info(clc.red.bold(`------------------ DRYRUN --------------------`))
    }
    await lookForNewExpantions();
    await updateSets();
    await updatePokedex();
    await updateRegCards();
    if (args.d) updateMetaFile()
}

/**
 * Scrapes data from multiple sources to get set metadata 
 */
export async function lookForNewExpantions() {
    consoleHeader("Searching for new sets", logger);
    let serebiiNewSets = await getSerebiiLastestNormalExpantions(5);

    for (let set of serebiiNewSets) {
        logger.info(clc.greenBright(`Processing: ${set.name}`))
        let tcgpMatches = JSON.stringify(await findSetFromTCGP(set.name))
        logger.info(`TCG Player matches: ${tcgpMatches}`)
        let series = getLatestSeries();
        let prSet = await getPMCExpansion(set.name);
        if (tcgpMatches !== "[]" && await expantionExistsInDB(set.name) == false) {
            let exp: Expansion = new Expansion(
                set.name,
                series,
                "",
                ""
            );
            exp.tcgName = tcgpMatches
            exp.numberOfCards = 0;
            exp.releaseDate = prSet?.relDate ?? ""
            consoleHeader(`Adding new Set`, logger);
            logger.info(JSON.stringify(exp))
            upsertExpantion(exp)
        }
    }
}

/**
 * Looks for Updates for the last 6 set to make sure any linguring updates from data sources
 */
async function updateSets() {
    consoleHeader(`Updating last ${COUNT} expansions`, logger);
    let exps: Expansion[] = getLatestExpansions(COUNT);
    for (let exp of exps) {
        logger.info(clc.green(`Processing ${exp.name}`));
        let updated = false;
        let serebii = await getSerebiiExpantion(exp.name)
        let prSet = await getPMCExpansion(exp.name);
        //Update set from Serebii
        if (serebii != null && (
            exp.logoURL != serebii.logo ||
            exp.symbolURL != serebii.symbol ||
            exp.numberOfCards != serebii.numberOfCards
        )) {
            logger.info('Serebii set found')
            exp.logoURL = serebii.logo
            exp.symbolURL = serebii.symbol
            exp.numberOfCards = serebii.numberOfCards
            updated = true
            await downloadFile(serebii.logo, `./images/exp_logo/${exp.name.replace(" ", "-")}.png`)
            await downloadFile(serebii.symbol, `./images/exp_symb/${exp.name.replace(" ", "-")}.png`)
        }
        //Update Set from PMC PR web site
        if (prSet != null && exp.releaseDate == null) {
            exp.releaseDate = prSet.relDate
            updated = true;
        }
        //Update Set from tcgp
        let tcgp = JSON.stringify(await findSetFromTCGP(exp.name))
        logger.info(`TCGP Sets found ${tcgp}`)
        if (tcgp !== "[]" && tcgp !== exp.tcgName) {
            updated = true;
            exp.tcgName = tcgp
        }
        if (updated) {
            logger.info(`Updating ${exp.name}`)
            logger.info(JSON.stringify(exp))

            upsertExpantion(exp)
        } else {
            logger.info(`No Updates for ${exp.name}`)
        }
    }
}

/**
 * Update Regular set cards
 */
async function updateRegCards() {
    consoleHeader(`Updating Cards from last ${COUNT} expansions`, logger);
    let exps: Expansion[] = getLatestExpansions(COUNT);
    for (let exp of exps) {
        logger.info(clc.blueBright(`Processing ${exp.name} Cards`))
        let serebii = await getSerebiiExpantion(exp.name);
        if (serebii == null) { logger.info(clc.red(`Failed to find serebii set : ${exp.name} could be promo set`)); continue }
        let serebiiCards = await getSerebiiSetCards(serebii.page, exp)
        let tcgpCards = await pullTcgpSetCards(exp)
        for (let card of serebiiCards) {
            await serebiiUpsertCard(card, exp)
        }
        for (let card of tcgpCards) {
            await tcgpUpsertCard(card, exp)
        }
    }
}

async function updatePromoCards() {

}

/**
 * Update Pokedex 
 */
async function updatePokedex() {
    consoleHeader(`Updating Pokedex`, logger);
    let serebiiPokemon = await getSerebiiPokemon()
    let highest = getHighestPokedexNumber()
    for (let i = highest; i < serebiiPokemon.length; i++) {
        let pokemon = serebiiPokemon[i]
        upsertPokemon(pokemon.name, pokemon.id)
    }
}

export function updateMetaFile() {
    metaData.data++;
    fs.writeFileSync("./meta.json", JSON.stringify(metaData));
}