import clc from 'cli-color'
import * as fs from 'fs'
import fetch from 'node-fetch'
import { Expansion } from './CardMeta.js';
import { CategoryProvider, Category } from "typescript-logging-category-style";
import { LogLevel } from 'typescript-logging';
import { Card } from "./Card.js"
import { getPokemon, upsertCard } from './database.js';
import { logger } from './data-scrapper.js';

let dryrun = false;
let provider: CategoryProvider;

function delay(ms) { return new Promise(_ => setTimeout(_, ms)) };

export async function downloadFile(url: string, path: string) {
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
};

export async function consoleHeader(msg: string, logger: Category) {
    logger.info(clc.blueBright.bold("----------------------------------------------"))
    logger.info(clc.blueBright.bold(msg))
    logger.info(clc.blueBright.bold("----------------------------------------------"))
}

export function setUpLogger(verbose: boolean) {
    if (verbose) {
        provider = CategoryProvider.createProvider("Pokedata", { level: LogLevel.Debug });
    } else {
        provider = CategoryProvider.createProvider("Pokedata", { level: LogLevel.Info });
    }
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
export function getExpNumber(number: string) {
    let regex = /([a-zA-Z]+)([0-9]+)/g
    let results = regex.exec(number)
    if (results) return `${results[1]}${results[2].padStart(2, "0")}`
    return number.padStart(3, "0")
}

export function getId(set: string, name: string, number: string) {
    let _set = set.trim().replaceAll(' ', '-').replaceAll(`/`, `-`)
    let _name = name
        .replaceAll(/\([a-zA-Z\s0-9]+\)/g, "")
        .replaceAll(/[0-9]+\/[0-9]+/g, "")
        .trim()
        .replaceAll(' ', '-')
        .replaceAll(`/`, `-`)
    let _num = getExpNumber(number.trim())
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

export async function addCard(card: Card, downloadPath?: string) {
    if (downloadPath != null) {
        let file = `${downloadPath}/${card.cardId.replaceAll("/", "-")}.jpg`
        logger.debug(clc.blackBright(`Downloading picture to ${file}`))
        if (dryrun) await downloadFile(card.img, file)
        await delay(300)
    }
    card.pokedex = getPokemon(card.name)
    upsertCard(card)
}