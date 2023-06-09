import * as stringSimilarity from "string-similarity";
import fetch from "node-fetch";
import { Card } from "../model/Card.js";
import { Expansion } from "../model/CardMeta.js";
import clc from "cli-color";

import {
  formatExpNumber,
  formatId,
  cardExpFolder,
  addCard,
  normalizeSetName,
  logger,
  consoleHeader,
} from "../common.js";

import {
  findCardComplex,
  upsertExpantion,
  upsertSealedProduct,
} from "../database.js";

export type TcgpSet = {
  urlVal: string;
  value: string;
  count: number;
};

export type TcgpCode = {
  name: string;
  code: string;
};

export let tcgpSets = new Array<TcgpSet>();
export let tcgpCodes = new Array<TcgpCode>();

const TCGP_API = "https://mp-search-api.tcgplayer.com/v1/search/request";
const TCGP_IMAGE_API = "https://product-images.tcgplayer.com/fit-in/437x437"
const UPDATE_SET = "UPDATE expansions SET tcgName = $tcgName WHERE name = $name";
const UPDATE_CARD =
  "UPDATE cards SET " +
  "idTCGP = $idTCGP, " +
  "expIdTCGP = $expIdTCGP, " +
  "rarity = $rarity, " +
  "cardType = $cardType, " +
  "expCodeTCGP = $expCodeTCGP, " +
  "releaseDate = $releaseDate, " +
  "description = $description, " +
  "variants = $variants " +
  "WHERE expCardNumber = $expCardNumber AND expName = $expName";

const tcgRequest = `{
    "algorithm": "",
    "from": 0,
    "size": 1,
    "filters": {
      "term": {
        "productLineName": [
          "pokemon"
        ],
        "setName": [
              ],
        "productTypeName": [
          "Cards"
        ]
      },
      "range": {},
      "match": {}
    },
    "listingSearch": {
      "filters": {
        "term": {},
        "range": {
          "quantity": {
            "gte": 1
          }
        },
        "exclude": {
          "channelExclusion": 0
        }
      },
      "context": {
        "cart": {}
      }
    },
    "context": {
      "cart": {},
      "shippingCountry": "US"
    },
    "sort": {}
}`;

/**
 * Pull Cards for a given expantion
 * @param set
 */
export async function pullTcgpSetCards(set: Expansion): Promise<Card[]> {
  let cards = new Array<Card>();
  logger.debug(`Pulling TCGP Set: ${set.name} tcgp: ${set.tcgName}`);
  if (
    set.tcgName == null ||
    set.tcgName === "" ||
    set.tcgName === `["N/A"]` ||
    set.tcgName === `[]`
  )
    return cards;
  let request = JSON.parse(tcgRequest);
  request.size = 300;
  request.filters.term.setName = JSON.parse(set.tcgName);
  let url = new URL(TCGP_API);
  url.searchParams.set("q", "");
  url.searchParams.set("isList", "false");
  let response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  let data: any = await response.json();
  for (let card of data.results[0].results) {
    if (card.productName.includes("Code Card")) continue;
    let newCard: Card = await convertCard(card, set.name, set.releaseDate);
    //console.log(`TCGP Card: ${newCard.cardId}`)
    cards.push(newCard);
  }
  return cards;
}

/**
 * Convert tcgp card result into Card object
 * @param card
 * @param setName
 * @param setReleaseDate
 * @returns
 */
async function convertCard(card: any, setName: string, setReleaseDate: string): Promise<Card> {
  let releaseDate =
    card.customAttributes.releaseDate === null ? setReleaseDate : card.customAttributes.releaseDate;
  let cardNum = formatExpNumber(card.customAttributes.number.split("/")[0]);
  let img = `${TCGP_IMAGE_API}/${card.productId.toFixed()}.jpg`;
  let variants = await pullVariants(card.productId);
  let id = formatId(setName, card.productName, cardNum);
  let newCard: Card = {
    cardId: id,
    idTCGP: card.productId,
    name: card.productName,
    expIdTCGP: card.setUrlName,
    expCodeTCGP: (await getTcgpCode(card.setUrlName)) ?? "",
    expName: setName,
    expCardNumber: cardNum,
    rarity: card.rarityName,
    img: img,
    price: card.marketPrice,
    releaseDate: releaseDate,
    energyType:
      card.customAttributes.energyType != null ? card.customAttributes.energyType[0] ?? "" : "",
    cardType: card.customAttributes.cardType != null ? card.customAttributes.cardType[0] ?? "" : "",
    variants: variants,
  };
  return newCard;
}

/**
 * Get a list of TCGP set names that are relevant to the name provided
 * @param name
 * @returns
 */
export async function findSetFromTCGP(name: string): Promise<string[]> {
  if (tcgpSets.length === 0) {
    await getTcgpExpsData();
  }
  let matches = new Array<string>();
  for (let tcgpSet of tcgpSets) {
    let tcgpNorm = normalizeSetName(tcgpSet.value).toLowerCase();
    let nameNorm = normalizeSetName(name).toLowerCase();
    let conf = stringSimilarity.compareTwoStrings(tcgpNorm, nameNorm);
    let tcgpName = tcgpSet.value.toLowerCase();
    let push = false;
    if (conf > 0.7) {
      push = true;
      logger.debug(`tcgp-player match: tcgp: ${tcgpNorm}, name: ${nameNorm} conf: ${conf}`);
    }
    if (tcgpName.includes(nameNorm)) {
      push = true;
    }
    if (nameNorm.includes("promo") === false && tcgpName.includes("promo") === true) {
      push = false;
    }
    if (nameNorm.includes("promo") === true && tcgpName.includes("promo") === false) {
      push = false;
    }
    let promo_rm = nameNorm
      .replace("promos", "")
      .replace("promo", "")
      .replace("cards", "")
      .replace("card", "")
      .trim();
    if (nameNorm.includes("promo") && tcgpName.includes(promo_rm) === false) {
      push = false;
    }
    if (push) {
      matches.push(tcgpSet.urlVal);
    }
  }
  return matches;
}

/**
 * Populate the TCG Player sets
 */
async function getTcgpExpsData() {
  let response = await fetch(TCGP_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: tcgRequest,
  });
  if(response.status >= 300){
    logger.error(`Request to TCGP_API failed: ${response.status} ${await response.text()}`);
    return
  }
  let data: any;
  try {
    data = await response.json();
  } catch (e) {
    logger.error(`Failed to parse :${e}`);
    return
  }
  for (let setName of data.results[0].aggregations.setName) {
    tcgpSets.push({ urlVal: setName.urlValue, value: setName.value, count: setName.count });
  }
}

/**
 * Pulls the variants for a card
 * @param idTCGP
 * @returns List of variants
 */
export async function pullVariants(idTCGP): Promise<string[]> {
  let variants = new Array<string>();
  let resp = await fetch(
    `https://infinite-api.tcgplayer.com/price/history/${idTCGP}?range=quarter`
  );
  let data: any = await resp.json();
  if (data.result != null && data.result.length != 0) {
    let prices = data.result[0].variants;
    if (prices != null) {
      for (let price of prices) {
        variants.push(price.variant);
      }
    }
  }
  return variants;
}

/**
 * Get the Tcgp Code for
 * @param tcgpSetName
 * @returns Tcgp code or ""
 */
export async function getTcgpCode(tcgpSetName): Promise<string> {
  if (tcgpCodes.length === 0) {
    await getCodes();
  }
  let codes = tcgpCodes.find(
    (value) => stringSimilarity.compareTwoStrings(tcgpSetName, value.name) > 0.8
  );
  if (codes == null) {
    return "";
  }
  return codes.code;
}

/**
 * Initializes the tcgp codes
 */
async function getCodes() {
  let res = await fetch(`https://mpapi.tcgplayer.com/v2/massentry/sets/3`);
  let data: any = await res.json();
  tcgpCodes = data.results;
}

/**
 * Search for a card on tcgp
 * @param name
 * @param set set name to add to card returned
 * @returns
 */
export async function tcgpCardSearch(name: string, set: string): Promise<Card | undefined> {
  let url = new URL(TCGP_API);
  url.searchParams.set("q", `${set} ${name}`);
  url.searchParams.set("isList", "false");

  let res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: tcgRequest,
  });
  let data: any = await res.json().then();
  if (data.results[0].results.length === 0) return null;
  if (data.results.length > 1) {
    logger.warn(`Multiple results [${data.results[0].productName},${data.results[1].productName}]`);
  } else {
    logger.debug(`TCGP search results ${data.results[0].productName}`);
  }
  return await convertCard(data.results[0].results[0], set, "");
}

/**
 * Add card from TCGP
 * @param card
 * @param exp
 */
export async function tcgpUpsertCard(card: Card, exp: Expansion) {
  is_speacial_card(card);
  let db_card = findCardComplex(exp.name, card.expCardNumber);
  let path = cardExpFolder(exp);
  if (db_card != null) path = null;
  await addCard(card, UPDATE_CARD, path);
}

//Finds speacial variants of cards and changes their number to have a different
function is_speacial_card(canidate: Card) {
  if (canidate.name.match(/.*\(.*(Exclusive).*\).*/)) {
    canidate.cardId = `${canidate.cardId}-${canidate.idTCGP}`;
    canidate.expCardNumber = `${canidate.expCardNumber}-${canidate.idTCGP}`;
  }
}

/**
 * Update expansion TCGP
 * @param exp
 */
export async function updateExpansionTCGP(exp: Expansion) {
  let tcgpExp = await findSetFromTCGP(exp.name);
  logger.debug(`Found TCGP sets ${JSON.stringify(tcgpExp)}`);
  if (tcgpExp == null || tcgpExp.length === 0) {
    logger.debug(`Could not find TCGP set for name: ${exp.name}`);
  }
  exp.tcgName = JSON.stringify(tcgpExp);
  upsertExpantion(exp, UPDATE_SET);
}

/**
 * update Sealed Products
 * from tcgp api
 */
export async function updateSealedProducts() {
  consoleHeader("Pulling sealed product");
  let total = 1000;
  let request = JSON.parse(tcgRequest);
  request.filters.term.productTypeName.pop();
  request.filters.term.productTypeName.push("Sealed Products");
  request.size = 250;
  for (let i = 0; i < total; i += 250) {
    request.from = i;
    try {
      let response = await fetch(`${TCGP_API}?q=&isList=false`, {
        method: "POST",
        body: JSON.stringify(request),
        headers: { "Content-Type": "application/json" },
      });
      let json: any = await response.json();
      let productList = json.results[0].results;

      if (total === 1000) {
        console.log(json.results[0].totalResults);
        total = json.results[0].totalResults;
      }

      for (let product of productList) {
        upsertSealedProduct({
          name: product.productName,
          price: product.marketPrice,
          idTCGP: product.productId,
          releaseDate: product.customAttributes?.releaseDate ?? "",
          expIdTCGP: product.setUrlName,
          productType: getType(product.productName),
          expName: "",
          img: `${TCGP_IMAGE_API}/${product.productId?.toFixed()}.jpg`,
        });
      }
    } catch (err) {
      console.log(err);
    }
  }
}



function getType(name) {
  if (!name) {
    return "";
  }
  if (name.includes("Booster Box")) {
    return "Booster Box";
  } else if (name.includes("Elite Trainer Box")) {
    return "ETB";
  } else if (name.includes("Booster Pack")) {
    return "Booster Pack";
  } else if (
    name.includes("Premium") ||
    name.includes("Deluxe") ||
    name.includes("Collector") ||
    name.includes("Special")
  ) {
    return "Special item";
  } else if (name.includes("Box")) {
    return "Box";
  } else if (name.includes("Blister")) {
    return "Blister";
  } else if (name.includes("Theme Deck")) {
    return "Theme Deck";
  } else {
    return "";
  }
}
