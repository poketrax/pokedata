
import minimist, { ParsedArgs } from 'minimist'
import * as fs from 'fs'
import * as cliProgress from 'cli-progress';
import { consoleHeader, logger, setDryrun, setUpLogger, dejoinCard, MetaData } from './common.js';
import { upsertPrice, useTestDbFile, getPricesComplex, getCardsByDate, getPrice } from './database.js';
import clc from 'cli-color'
import { scrapeEbay } from './scrappers/ebay-scrapper.js';
import { Price } from './model/Card.js';

//Cards with a release date between now and RECENT_HIGH_RES_PERIOD days ago will be pulled weekly
const RECENT_HIGH_RES_REL_PERIOD = 3 * 360
const RECENT_HIGH_RES_PRICE_PERIOD = 7
//Cards with a release date between LEGAVY_MED_RES_PERIOD and the begining of time will be pulled quarterly
const LOW_RES_REL_PERIOD = 15 * 360
const LOW_RES_PRICE_PERIOD = 90

export const PRICE_LIMIT = 300
let args: ParsedArgs;
let metaData: MetaData = JSON.parse(fs.readFileSync("./meta.json", "utf-8"));

let updated: boolean

run();

export async function run() {
    args = minimist(process.argv.slice(2), {
        boolean: ['dryrun', 'fresh', 'verbose', 'high', 'low', 'all'],
        alias: {
            d: 'dryrun',
            f: 'fresh',
            v: 'verbose',
            h: 'high',
            l: 'low',
            a: 'all'
        },
        default: {
            set: null
        }
    })
    setUpLogger(args.v)
    if (args.d === true) {
        useTestDbFile(args.f)
        logger.info(clc.red.bold(`------------------ DRYRUN --------------------`))
        logger.info(clc.red.bold(`--------- Results at test-data.sql -----------`))
        logger.info(clc.red.bold(`------------------ DRYRUN --------------------`))
        setDryrun()
    }

    let now = new Date()
    let relStartHR = new Date();
    let priceFilterHR = new Date();
    if (args.h) await pullPrices(
        new Date(relStartHR.setDate(relStartHR.getDate() - RECENT_HIGH_RES_REL_PERIOD)),
        now,
        new Date(priceFilterHR.setDate(priceFilterHR.getDate() - RECENT_HIGH_RES_PRICE_PERIOD)),
        "High Res",
        true
    )
    let relStartLR = new Date();
    let priceFilterLR = new Date();
    if (args.l) await pullPrices(
        new Date(relStartLR.setDate(relStartLR.getDate() - LOW_RES_REL_PERIOD)),
        now,
        new Date(priceFilterLR.setDate(priceFilterLR.getDate() - LOW_RES_PRICE_PERIOD)),
        "Low Res",
        false
    )
    if (args.a) await pullAll()
    if (args.d === false && updated) updateMetaFile()
}

async function pullPrices(relStart: Date, relEnd: Date, priceFilter: Date, msg: string, rare: boolean) {
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    consoleHeader(`Pulling ${msg} Cards`)
    let complexRows = getPricesComplex(relStart, relEnd, priceFilter)
    if (complexRows == null) { logger.info(clc.magenta(`No ${msg} cards need updating`)); return }
    logger.info(clc.green(`${msg} cards that need updating: ${complexRows.length} prices`))
    let date = new Date()
    bar.start(complexRows.length, 0)
    let index = 0
    for (let complexRow of complexRows) {
        let card = dejoinCard(complexRow)
        let raw = await scrapeEbay(card, 'raw')
        let grade9 = await scrapeEbay(card, 'grade9')
        let grade10 = await scrapeEbay(card, 'grade10')
        let variant = card.variants?.length === 1 ? card.variants[0] : ""
        let price: Price =
        {
            date: date.toISOString(),
            cardId: card.cardId,
            variant: variant,
            rawPrice: raw,
            gradedPriceNine: grade9,
            gradedPriceTen: grade10
        };
        upsertPrice(price)
        index++
        bar.update(index)
    }
    updated = true;
}

async function pullAll() {
    consoleHeader(`Pulling Cards with no price`)
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(PRICE_LIMIT, 0)
    let cards = getCardsByDate(new Date(0), new Date(), false)
    let index = 0;
    let date = new Date()
    for (let card of cards) {
        let found = getPrice(card.cardId)
        if (found) continue;
        if (index > PRICE_LIMIT) return;
        updated = true;
        let raw = await scrapeEbay(card, 'raw')
        let grade9 = await scrapeEbay(card, 'grade9')
        let grade10 = await scrapeEbay(card, 'grade10')
        let variant = card.variants?.length === 1 ? card.variants[0] : ""
        let price: Price =
        {
            date: date.toISOString(),
            cardId: card.cardId,
            variant: variant,
            rawPrice: raw,
            gradedPriceNine: grade9,
            gradedPriceTen: grade10
        };
        upsertPrice(price)
        logger.debug(clc.greenBright(JSON.stringify(price)))
        index++
        bar.update(index)
    }
}

export function updateMetaFile() {
    metaData.prices++;
    fs.writeFileSync("./meta.json", JSON.stringify(metaData));
}