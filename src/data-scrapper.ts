import * as fs from "fs";
import clc from "cli-color";
import minimist from "minimist";
import { Expansion } from "./model/CardMeta.js";
import { updateExpansionPmc } from "./scrappers/pmc-scrapper.js";
import {
  pullTcgpSetCards,
  tcgpCardSearch,
  tcgpUpsertCard,
  updateExpansionTCGP,
  updateSealedProducts,
} from "./scrappers/tcgp-scrapper.js";
import { consoleHeader, setUpLogger, logger, setDryrun, MetaData } from "./common.js";
import {
  useTestDbFile,
  getHighestPokedexNumber,
  upsertPokemon,
  expantionExistsInDB,
  getExpansion,
} from "./database.js";
import {
  getSerebiiLastestNormalExpantions,
  getSerebiiExpantion,
  getSerebiiPokemon,
  getSerebiiSetCards,
  serebiiUpsertCard,
  serebiiUpsertSet,
  getSerebiiLastestPromoExpantions,
  serebiiNormalSets,
  serebiiPromoSets,
} from "./scrappers/serebii-scrapper.js";

export const COUNT = 5;

let metaData: MetaData = JSON.parse(fs.readFileSync("./meta.json", "utf-8"));
let args: minimist.ParsedArgs;

run();

async function run() {
  args = minimist(process.argv.slice(2), {
    string: ["cards", "lang"],
    boolean: ["dryrun", "fresh", "verbose"],
    alias: {
      d: "dryrun",
      f: "fresh",
      v: "verbose",
      l: "lang",
    },
    default: {
      cards: null,
      lang: "en",  // Default to English
    },
  });
  setUpLogger(args.v);
  
  // Validate and set language
  const language = (args.lang === 'jp' || args.lang === 'japanese') ? 'jp' : 'en';
  logger.info(clc.cyan(`Scraping ${language === 'en' ? 'English' : 'Japanese'} cards`));
  
  if (args.d) {
    useTestDbFile(args.f);
    logger.info(clc.red.bold(`------------------ DRYRUN --------------------`));
    logger.info(clc.red.bold(`--------- Results at test-data.sql -----------`));
    logger.info(clc.red.bold(`------------------ DRYRUN --------------------`));
    setDryrun();
  }
  logger.debug(`single set: ${args.cards}`)
  // Update one exp's cards
  if (args.cards != null) {
    let expName = expantionExistsInDB(args.cards);
    if (expName == null) {
      logger.error(`Could Not find set : ${args.cards}`);
      return;
    }
    let exp = getExpansion(expName);
    updateCards([exp]);
    return;
  } else {
    //update all
    let exps = await updateExpansions(language);
    await updatePokedex();
    await updateSealedProducts();
    await updateCards(exps);
    if (args.d === false) updateMetaFile();
  }
}

/**
 * Scrapes data from multiple sources to get set metadata
 */
export async function updateExpansions(language: 'en' | 'jp' = 'en'): Promise<Expansion[]> {
  let expansions = new Array<Expansion>();
  consoleHeader(`Searching for new sets (${language === 'en' ? 'English' : 'Japanese'})`);
  let serebiiNewSets = await getSerebiiLastestNormalExpantions(COUNT, language);
  for (let set of serebiiNewSets) {
    let exp = await serebiiUpsertSet(set);
    await updateExpansionPmc(exp);
    await updateExpansionTCGP(exp);
    if (exp) expansions.push(exp);
  }
  consoleHeader("Searching for new promo sets");
  let serebiiPromoSets = await getSerebiiLastestPromoExpantions(COUNT - 1, language);
  for (let set of serebiiPromoSets) {
    let exp = await serebiiUpsertSet(set);
    await updateExpansionPmc(exp);
    await updateExpansionTCGP(exp);
    if (exp) expansions.push(exp);
  }
  return expansions;
}

/**
 * Update cards
 * @param exps
 */
async function updateCards(exps: Expansion[]) {
  consoleHeader("Updating Cards");
  for (let exp of exps) {
    logger.info(clc.blueBright(`Processing ${exp.name} Cards`));
    let serebii = await getSerebiiExpantion(exp.name);
    let tcgpCards = await pullTcgpSetCards(exp);
    if (serebii == null) {
      logger.info(
        clc.red(
          `Failed to find serebii set : ${exp.name} \nSets:\n${JSON.stringify(
            serebiiNormalSets
          )}\nPromos:${JSON.stringify(serebiiPromoSets)}`
        )
      );
      continue;
    }else{
      let serebiiCards = await getSerebiiSetCards(serebii.page, exp);
      for (let card of serebiiCards) {
        await serebiiUpsertCard(card, exp);
        if (tcgpCards.length === 0) {
          let tcgpCard = await tcgpCardSearch(card.name, exp.name);
          if (tcgpCard == null) continue;
          tcgpCard.img = card.img;
          if (tcgpCard) await tcgpUpsertCard(tcgpCard, exp);
        }
      }
    }
    for (let card of tcgpCards) {
      await tcgpUpsertCard(card, exp);
    }
  }
}

/**
 * Update Pokedex
 */
async function updatePokedex() {
  consoleHeader(`Updating Pokedex`);
  let serebiiPokemon = await getSerebiiPokemon();
  let highest = getHighestPokedexNumber();
  for (let i = highest; i < serebiiPokemon.length; i++) {
    let pokemon = serebiiPokemon[i];
    upsertPokemon(pokemon.name, pokemon.id);
  }
}

export function updateMetaFile() {
  let npm = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
  metaData.version = npm.version;
  metaData.data++;
  fs.writeFileSync("./meta.json", JSON.stringify(metaData));
}
