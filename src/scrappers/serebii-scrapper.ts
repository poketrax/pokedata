import * as stringSimilarity from "string-similarity";
import * as jsdom from "jsdom";
import * as fs from "fs";
import clc from "cli-color";
import fetch from "node-fetch";
import type { Card } from "../model/Card.js";
import { Expansion } from "../model/CardMeta.js";
import {
  formatExpNumber,
  formatId,
  addCard,
  cardExpFolder,
  normalizeSetName,
  logger,
  downloadFile,
} from "../common.js";
import { COUNT } from "../data-scrapper.js";
import {
  findCardComplex,
  getLatestSeries,
  expantionExistsInDB,
  upsertExpantion,
  getExpansion,
} from "../database.js";

const UPDATE_SET =
  "UPDATE expansions SET numberOfCards = $numberOfCards, logoURL = $logoURL, symbolURL = $symbolURL WHERE name = $name";
const UPDATE_CARD =
  "UPDATE cards " +
  "SET cardId = $cardId, " +
  "img = $img " +
  "WHERE expCardNumber = $expCardNumber AND expName = $expName";

export type SerebiiExpantion = {
  name: string;
  page: string;
  logo: string;
  symbol: string;
  numberOfCards: number;
};
export let serebiiNormalSets = new Array<SerebiiExpantion>();
export let serebiiPromoSets = new Array<SerebiiExpantion>();

/**
 * Get latest expansions from
 * @param num
 * @returns
 */
async function scrapeSerebiiSets(
  num: number,
  url: string
): Promise<SerebiiExpantion[]> {
  let res = await fetch(url);
  let data = await res.text();
  const { window } = new jsdom.JSDOM(data);
  let setTable: HTMLTableElement =
    window.document.getElementsByTagName("table")[0];
  let sets = new Array<SerebiiExpantion>();
  num++; //increament since we start on row 1 to skip table headers
  for (let i = 1; i < num; i++) {
    let cells = setTable.rows[i].cells;
    let pageUrl = `https://www.serebii.net${
      (cells[0].children[0] as HTMLAnchorElement).href
    }`;
    sets.push({
      name: cells[0].children[0].textContent.trim(),
      page: pageUrl,
      logo: await getLogoUrl(pageUrl),
      symbol: `https://www.serebii.net${
        (cells[2].children[0].children[0] as HTMLImageElement).src
      }`,
      numberOfCards: parseInt(cells[1].textContent),
    });
  }
  return sets;
}

export async function getSerebiiLastestNormalExpantions(num: number) {
  let url = `https://www.serebii.net/card/english.shtml`;
  if (serebiiNormalSets.length >= num) return serebiiNormalSets;
  serebiiNormalSets = await scrapeSerebiiSets(num, url);
  return serebiiNormalSets;
}

export async function getSerebiiLastestPromoExpantions(num: number) {
  let url = `https://www.serebii.net/card/engpromo.shtml`;
  if (serebiiPromoSets.length >= num) return serebiiPromoSets;
  serebiiPromoSets = await scrapeSerebiiSets(num, url);
  return serebiiPromoSets;
}

/**
 * get serebii expansion by name
 * @param name
 * @returns
 */
export async function getSerebiiExpantion(
  name: string
): Promise<SerebiiExpantion> {
  if (serebiiNormalSets.length <= 0)
    await getSerebiiLastestNormalExpantions(COUNT);
  if (serebiiPromoSets.length <= 0)
    await getSerebiiLastestPromoExpantions(COUNT);
  if (name.matchAll(/promo|Promo/g)) {
    return serebiiPromoSets.find(
      (set) =>
        stringSimilarity.compareTwoStrings(
          normalizeSetName(set.name),
          normalizeSetName(name)
        ) > 0.7
    );
  }
  return serebiiNormalSets.find(
    (set) =>
      stringSimilarity.compareTwoStrings(
        normalizeSetName(set.name),
        normalizeSetName(name)
      ) > 0.7
  );
}

/**
 * Get logo
 * @param setUrl
 * @returns
 */
export async function getLogoUrl(setUrl: string): Promise<string> {
  let res = await fetch(setUrl);
  let data = await res.text();
  const { window } = new jsdom.JSDOM(data);
  let logo: HTMLImageElement = window.document
    .getElementsByTagName("main")[0]
    .getElementsByTagName("img")[0];
  return `https://www.serebii.net${logo.src}`;
}

/**
 * Get Serebii cards
 * @param setUrl
 * @param set
 * @returns
 */
export async function getSerebiiSetCards(
  setUrl: string,
  set: Expansion
): Promise<Card[]> {
  let res = await fetch(setUrl);
  let data = await res.text();
  const { window } = new jsdom.JSDOM(data);
  let table: HTMLTableElement =
    window.document.getElementsByClassName("dextable")[0];
  let rows = table.getElementsByTagName("tr");
  let cards = new Array<Card>();
  for (let i = 1; i < rows.length; i++) {
    let row = rows[i];
    if (row.cells.length !== 4) continue;
    let rawNum = row.cells[0].textContent;
    let rawSet = row.cells[0].getElementsByTagName("a")[0].text;
    if (rawSet) rawNum = rawNum.replace(rawSet, "");
    let cardNum = formatExpNumber(rawNum);
    let rarity = parseRarity(
      row.cells[0].getElementsByTagName("img")[0] as HTMLImageElement
    );
    let img = `https://www.serebii.net${
      (row.cells[1].getElementsByTagName("img")[0] as HTMLImageElement).src
    }`.replace("/th", "");
    let name = row.cells[2].textContent.trim();
    let energy = parseEnergy(row.cells[3]);
    let id = formatId(set.name, name, cardNum);
    id = id.replaceAll(" ", "-");
    cards.push({
      cardId: id.toString(),
      idTCGP: 0,
      name: name,
      expCodeTCGP: "",
      expIdTCGP: "",
      expName: set.name,
      expCardNumber: cardNum,
      rarity: rarity,
      img: img,
      energyType: energy,
    });
  }
  return cards;
}

export async function getSerebiiPokemon(): Promise<any[]> {
  let pokemon = [];
  let res = await fetch(
    `https://www.serebii.net/pokemon/nationalpokedex.shtml`
  );
  let data = await res.text();
  const { window } = new jsdom.JSDOM(data);
  let table: HTMLTableElement =
    window.document.getElementsByClassName("dextable")[0];
  let rows = table.rows;
  for (let i = 2; i < rows.length; i++) {
    let row = rows[i];
    let number = parseInt(row.cells[0].textContent.replace("#", ""));
    let name = row.cells[2].textContent.trim();
    pokemon.push({ name: name, id: number });
  }
  return pokemon;
}

export async function serebiiUpsertCard(card: Card, exp: Expansion) {
  let dbCard = findCardComplex(exp.name, card.expCardNumber);
  //Case where img was already downloaded
  if (
    dbCard != null &&
    dbCard.img === card.img &&
    fs.existsSync(
      `${cardExpFolder(exp)}/${card.cardId.replaceAll("/", "-")}.jpg`
    )
  ) {
    await addCard(card, UPDATE_CARD);
    return;
  }
  //Case where img has not been downloaded
  if (dbCard != null) {
    dbCard.img = card.img;
    await addCard(dbCard, UPDATE_CARD, cardExpFolder(exp));
    return;
  }
  //Case where card is new
  await addCard(card, UPDATE_CARD, cardExpFolder(exp));
}

function parseRarity(img: HTMLImageElement): string {
  let imgSrc = img.src;
  if (imgSrc.includes("common")) return "Common";
  if (imgSrc.includes("uncommon")) return "Uncommon";
  if (imgSrc.includes("holographic")) return "Holo Rare";
  if (imgSrc.includes("lvxrar")) return "Ultra Rare";
  return "Common";
}

function parseEnergy(cell: HTMLTableCellElement): string {
  let img = cell.getElementsByTagName("img");
  if (img.length === 0) return "";
  let raw = img[0].src;
  if (raw.includes("grass")) return "Grass";
  if (raw.includes("fire")) return "Fire";
  if (raw.includes("water")) return "Water";
  if (raw.includes("electric")) return "Lightning";
  if (raw.includes("psychic")) return "Psychic";
  if (raw.includes("fighting")) return "Fighting";
  if (raw.includes("darkness")) return "Darkness";
  if (raw.includes("metal")) return "Metal";
  if (raw.includes("dragon")) return "Dragon";
  if (raw.includes("colorless")) return "Colorless";
  return "";
}

/**
 * Upsert a serebii set
 * @param set
 * @returns
 */
export async function serebiiUpsertSet(
  set: SerebiiExpantion
): Promise<Expansion | undefined> {
  logger.info(clc.green(`Processing Serebii Set: ${set.name}`));
  let series = getLatestSeries();
  let foundName = expantionExistsInDB(set.name);
  let exp: Expansion;
  if (foundName) {
    exp = getExpansion(foundName);
    exp.numberOfCards = set.numberOfCards;
    let dlLogoPath = `./images/exp_logo/${exp.name.replaceAll(" ", "-")}.png`;
    logger.debug(`Logo file: ${dlLogoPath}`);
    let dlSymblPath = `./images/exp_symb/${exp.name.replaceAll(" ", "-")}.png`;
    logger.debug(`Symbl file: ${dlSymblPath}`);
    logger.debug(
      `logo Same:${exp.logoURL !== set.logo}, sym Same:${
        exp.symbolURL !== set.symbol
      }, logo file?: ${!fs.existsSync(dlLogoPath)}, sym path?: ${!fs.existsSync(
        dlSymblPath
      )}`
    );
    if (
      exp.logoURL !== set.logo ||
      exp.symbolURL !== set.symbol ||
      !fs.existsSync(dlLogoPath) ||
      !fs.existsSync(dlSymblPath)
    ) {
      exp.logoURL = set.logo;
      exp.symbolURL = set.symbol;
      await downloadFile(set.logo, dlLogoPath);
      await downloadFile(set.symbol, dlSymblPath);
    }
  } else {
    exp = new Expansion(
      normalizeSetName(set.name).replace("PKM", "Pokemon"),
      series,
      set.logo,
      set.symbol
    );
    exp.numberOfCards = set.numberOfCards;
    exp.releaseDate = "";
    exp.tcgName = "";
    await downloadFile(
      set.logo,
      `./images/exp_logo/${exp.name.replace(" ", "-")}.png`
    );
    await downloadFile(
      set.symbol,
      `./images/exp_symb/${exp.name.replace(" ", "-")}.png`
    );
  }
  upsertExpantion(exp, UPDATE_SET);
  return exp;
}
