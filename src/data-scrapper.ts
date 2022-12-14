import * as fs from 'fs'
import clc from 'cli-color'
import minimist from 'minimist'
import { consoleHeader, downloadFile } from "./common.js"
import { Expansion } from "./CardMeta.js"
import { getLatestExpansions, upsertExpantion, getLatestSeries, expantionExistsInDB } from './database.js';
import { findSetFromTCGP } from './tcgp-scrapper.js'
import { getPMCExpansion } from './pmc-scrapper.js'
import { getSerebiiExpantion, getSerebiiLastestExpantions } from './serebii-scrapper.js'

type MetaData = {
    data: number,
    prices_high_res: number,
    prices_low_res: number
}

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
    let count = 6
    consoleHeader(`Updating last ${count} expansions`);
    let exps: Expansion[] = await getLatestExpansions(count);
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
        )){
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

function change() {
    if (changed) return;
    changed = true;
    metaData.data++;
    fs.writeFileSync("./meta.json", JSON.stringify(metaData));
}