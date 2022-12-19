import * as fs from 'fs'
import clc from 'cli-color'
import minimist from 'minimist'
import { consoleHeader, downloadFile, cardExpFolder } from "./common.js"
import { Expansion } from "./CardMeta.js"
import { Card } from "./Card.js"
import { getLatestExpansions, upsertExpantion, getLatestSeries, expantionExistsInDB, findCard, findTcgpCard, upsertCard } from './database.js';
import { findSetFromTCGP, pullTcgpSetCards } from './tcgp-scrapper.js'
import { getPMCExpansion } from './pmc-scrapper.js'
import { getSerebiiExpantion, getSerebiiLastestExpantions, getSerebiiSetCards } from './serebii-scrapper.js'

type MetaData = {
    data: number,
    prices_high_res: number,
    prices_low_res: number
}

const COUNT = 6

let metaData: MetaData = JSON.parse(fs.readFileSync("./meta.json", "utf-8"));
let changed = false;
export let dryrun = false;

run();

async function run() {
    let args = minimist(process.argv.slice(2), {
        boolean: ['dryrun'],
        alias: { d: 'dryrun' }
    })
    if (args.d) {
        dryrun = true;
        console.log(clc.red.bold(`------------------ DRYRUN --------------------`))
    }
    await lookForNewExpantions();
    await updateSets();
}

/**
 * Scrapes data from multiple sources to get set metadata 
 */
export async function lookForNewExpantions() {
    consoleHeader("Searching for new sets");
    let serebiiNewSets = await getSerebiiLastestExpantions(5);
    //console.log(prNewSets)
    for (let set of serebiiNewSets) {
        console.log(`Processing: ${set.name}`)
        let tcgpMatches = JSON.stringify(await findSetFromTCGP(set.name))
        console.log(`TCG Player matches: ${tcgpMatches}`)
        let series = await getLatestSeries();
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
            consoleHeader(`Adding new Set`);
            console.log(exp)
            change()
            if (dryrun === false) {
                upsertExpantion(exp)
            }
        }
    }
}

/**
 * Looks for Updates for the last 6 set to make sure any linguring updates from data sources
 */
async function updateSets() {
    consoleHeader(`Updating last ${COUNT} expansions`);
    let exps: Expansion[] = await getLatestExpansions(COUNT);
    for (let exp of exps) {
        console.log(clc.green(`Processing ${exp.name}`));
        let updated = false;
        let serebii = await getSerebiiExpantion(exp.name)
        let prSet = await getPMCExpansion(exp.name);
        //Update set from Serebii
        if (serebii != null && (
            exp.logoURL != serebii.logo ||
            exp.symbolURL != serebii.symbol ||
            exp.numberOfCards != serebii.numberOfCards
        )) {
            console.log('Serebii set found')
            exp.logoURL = serebii.logo
            exp.symbolURL = serebii.symbol
            exp.numberOfCards = serebii.numberOfCards
            updated = true
            if (dryrun === false) {
                await downloadFile(serebii.logo, `./images/exp_logo/${exp.name.replace(" ", "-")}.png`)
                await downloadFile(serebii.symbol, `./images/exp_symb/${exp.name.replace(" ", "-")}.png`)
            }
        }
        //Update Set from PMC PR web site
        if (prSet != null && exp.releaseDate == null) {
            exp.releaseDate = prSet.relDate
            updated = true;
        }
        //Update Set from tcgp 
        let tcgp = JSON.stringify(await findSetFromTCGP(exp.name))
        console.log(`TCGP Sets found ${tcgp}`)
        if (tcgp !== "[]" && tcgp !== exp.tcgName) {
            updated = true;
            exp.tcgName = tcgp
        }

        if (updated) {
            console.log(`Updating ${exp.name}`)
            console.log(exp)
            if (dryrun === false) {
                change()
                upsertExpantion(exp)
            }
        } else {
            console.log(`No Updates for ${exp.name}`)
        }
    }
}

async function updateRegCards() {
    consoleHeader(`Updating Cards from last ${COUNT} expansions`);
    let exps: Expansion[] = await getLatestExpansions(COUNT);
    for (let exp of exps) {
        let serebii = await getSerebiiExpantion(exp.name);
        let serebiiCards = await getSerebiiSetCards(serebii.page, exp)
        let tcgpCards = await pullTcgpSetCards(exp)

        for (let card of serebiiCards) {
            let dbCard = await findCard(card.cardId)
            if (dbCard != null) {
                dbCard.img = card.img;
                if(dryrun) continue
                let path = cardExpFolder(exp)
                downloadFile(dbCard.img, `${path}/${dbCard.cardId}`)
                await upsertCard(dbCard)
            } else {
                if(dryrun) continue
                await upsertCard(card);
            }
        }
        for (let card of tcgpCards) {
            let tcgpFound = await findTcgpCard(card.idTCGP) != null;
            let cardFound = await findCard(card.cardId);
            if (tcgpFound) continue;
            if (cardFound != null) {
                card.img = cardFound.img;
                if(dryrun) continue
                let path = cardExpFolder(exp)
                downloadFile(card.img, `${path}/${card.cardId}`)
            }
            if(dryrun) continue
            await upsertCard(card);
        }
    }
}

async function updatePromoCards() {
    
}

function change() {
    if (changed) return;
    changed = true;
    metaData.data++;
    fs.writeFileSync("./meta.json", JSON.stringify(metaData));
}