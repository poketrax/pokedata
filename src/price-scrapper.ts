
import minimist, { ParsedArgs } from 'minimist'
import * as cliProgress from 'cli-progress';
import { consoleHeader, logger, setDryrun, setUpLogger, dejoinCard } from './common.js';
import { upsertPrice, useTestDbFile, getPricesComplex } from './database.js';
import clc from 'cli-color'
import { scrapeEbay } from './scrappers/ebay-scrapper.js';
import { Price } from './model/Card.js';

//Cards with a release date between now and RECENT_HIGH_RES_PERIOD days ago will be pulled weekly
const RECENT_HIGH_RES_REL_PERIOD = 3 * 360
const RECENT_HIGH_RES_PRICE_PERIOD = 7
//Cards with a release date between LEGAVY_MED_RES_PERIOD and the begining of time will be pulled quarterly
const LEGAVY_MED_RES_PERIOD = 15 * 360

export const PRICE_LIMIT = 300
let args: ParsedArgs;
run();

export async function run() {
    args = minimist(process.argv.slice(2), {
        boolean: ['dryrun', 'fresh', 'verbose', 'recent', 'legacy', 'all'],
        alias: {
            d: 'dryrun',
            f: 'fresh',
            v: 'verbose',
            r: 'recent',
            l: 'legacy',
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
    if (args.r) await getRecentHighResPrices()
}

/**
 * Function finds cards whos
 *    - Release date is between now and RECENT_HIGH_RES_REL_PERIOD
 *    - Doesn't have a price 
 */
async function getRecentHighResPrices() {
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    consoleHeader("Pulling Recent Rare Cards")
    let relStart = new Date();
    relStart.setDate(relStart.getDate() - RECENT_HIGH_RES_REL_PERIOD)
    let priceStart = new Date();
    priceStart.setDate(priceStart.getDate() - RECENT_HIGH_RES_PRICE_PERIOD);
    let end = new Date();

    let complexRows = getPricesComplex(priceStart, end, relStart, end, true)
    logger.info(clc.green(`Get Recent Rare Cards pulling high res pricing: ${complexRows.length} prices`))
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
}