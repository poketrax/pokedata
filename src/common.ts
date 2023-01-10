import clc from 'cli-color'
import * as fs from 'fs'
import fetch from 'node-fetch'
import { Expansion } from './model/CardMeta.js';
import { CategoryProvider, Category } from "typescript-logging-category-style";
import { LogLevel } from 'typescript-logging';
import { Card, Price } from "./model/Card.js"
import { getPokemon, upsertCard } from './database.js';

export let dryrun = false;
let provider: CategoryProvider;

export let logger: Category;

export function delay(ms) { return new Promise(_ => setTimeout(_, ms)) };

export type MetaData = {
    data: number,
    prices: number
}
export async function downloadFile(url: string, path: string) {
    if (dryrun) return;
    const res = await fetch(url);
    const fileStream = fs.createWriteStream(path);
    await new Promise((resolve, reject) => {
        if (res.body != null) {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", resolve);
        } else {
            reject()
        }
    });
    await delay(200)
};

export async function consoleHeader(msg: string) {
    logger.info(clc.blueBright.bold("----------------------------------------------"))
    logger.info(clc.blueBright.bold(msg))
    logger.info(clc.blueBright.bold("----------------------------------------------"))
}

export function setUpLogger(verbose: boolean) {
    if (provider) return
    if (verbose) {
        provider = CategoryProvider.createProvider("Pokedata", { level: LogLevel.Debug });
    } else {
        provider = CategoryProvider.createProvider("Pokedata", { level: LogLevel.Info });
    }
    logger = getLogger("data-scraper")
}

export function setDryrun() {
    dryrun = true;
}

export function cardExpFolder(exp: Expansion): string {
    let path = `./images/cards/${exp.name.replaceAll(" ", "-")}`
    if (fs.existsSync(path)) return path;
    fs.mkdirSync(path);
    return path
}

/**
 * Normaize Exp Number
 * @param number 
 * @returns 
 */
export function formatExpNumber(number: string) {
    let regex = /(TG)?([A-Z]+)?([0-9]+)\s?( \/)?\s?([0-9]+)?([A-Z]+)?/g
    let results = regex.exec(number)
    if (results) {
        let tg = results[1];
        let alpha = results[2];
        let num = results[3]
        if (tg) return `${tg}${num.padStart(2, "0")}`
        if (alpha) return `${alpha}${num.padStart(3, "0")}`
        return `${num.padStart(3, "0")}`
    }
    return ''
}

export function formatId(set: string, name: string, number: string) {
    let _set = set.trim().replaceAll(' ', '-').replaceAll(`/`, `-`)
    let _name = name
        .replaceAll(/\([a-zA-Z\s0-9]+\)/g, "")
        .replaceAll(/[0-9]+\/[0-9]+/g, "")
        .trim()
        .replaceAll(' ', '-')
        .replaceAll(`/`, `-`)
    let _num = formatExpNumber(number.trim())
    return `${_set}-${_name}-${_num}`
}

// Javascript program to calculate the standard deviation of an array
export function dev(arr) {
    // Creating the mean with Array.reduce
    let mean = arr.reduce((acc, curr) => {
        return acc + curr
    }, 0) / arr.length;

    // Assigning (value - mean) ^ 2 to every array item
    arr = arr.map((k) => {
        return (k - mean) ** 2
    })

    // Calculating the sum of updated array
    let sum = arr.reduce((acc, curr) => acc + curr, 0);

    // Returning the standard deviation
    return Math.sqrt(sum / arr.length)
}

export function getLogger(name: string): Category {
    return provider.getCategory(name);
}

export async function addCard(card: Card, update: string, downloadPath?: string) {
    if (downloadPath != null) {
        let file = `${downloadPath}/${card.cardId.replaceAll("/", "-")}.jpg`
        logger.debug(clc.blackBright(`Downloading picture to ${file}`))
        if (dryrun) await downloadFile(card.img, file)
        await delay(300)
    }
    let dex = getPokemon(card.name)
    card.pokedex = dex == null ? null : dex.id
    upsertCard(card, update)
}

export function normalizeSetName(name: string): string {
    return name
        .replace(/Pokemon|pokemon|Pokémon|pokémon/, "PKM")
        .replace(/swsh-sword-and-shield/, "Sword & Shield")
        .replace(/swsh|SWSH/, "Sword & Shield")
        .replace(/sm|SM/, "Sun & Moon")
        .replace(/hgss/, "HeartGold SoulSilver")
        .replace(/and/, "&")
}

/**
 * Dejoin a record from sql join 
 * @param complex joined sql record
 * @returns 
 */
export function dejoinCard(complex: any): Card {
    return {
        cardId: complex.cardId,
        name: complex.name,
        idTCGP: complex.idTCGP,
        expIdTCGP: complex.expIdTCGP,
        expName: complex.expName,
        expCardNumber: complex.expCardNumber,
        rarity: complex.rarity,
        releaseDate: complex.releaseDate
    }
}

/**
 * Dejoin a record from sql join
 * @param complex joined sql record
 * @returns 
 */
export function dejoinPrice(complex: any): Price {
    return {
        date: complex.date,
        cardId: complex.cardId,
        variant: complex.variant,
        rawPrice: complex.rawPrice,
        gradedPriceNine: complex.gradedPriceNine,
        gradedPriceTen: complex.gradedPriceTen
    }
}