import * as jsdom from 'jsdom'
import * as fs from 'fs'
import clc from 'cli-color'
import * as stringSimilarity from "string-similarity";
import fetch from 'node-fetch'
import Database from 'better-sqlite3'


const db = new Database('./databases/data.sqlite')

const PMC_MARKETING_URL = "https://press.pokemon.com/en/Items/Schedule/Pokemon-Trading-Card-Game?types=3"
const PMC_CARD_DB_BASE_URL = "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/"
const SEARCH = "SELECT * FROM expansions WHERE name like ?";
const ADD = "INSERT INTO expansions (name, series, tcgName, numberOfCards, logoURL, symbolURL, releaseDate) " +
    "VALUES ($name, $series, $tcgName, $numberOfCards, $logoURL, $symbolURL, $releaseDate)";

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

const tcgpSets = [];
const pmcDbSets = [];

run();

async function run() {
    await lookForNewExpantions();
    await updateSets();
}

/** Scrapes data from multiple sources to get set metadata */
async function lookForNewExpantions() {
    consoleHeader("Searching for new sets");
    let prNewSets = await findNewSetsFromPR()
    console.log(prNewSets)
    for (let set of prNewSets) {
        console.log(`Processing: ${set.name}`)
        let tcgpMatches = await findSetFromTCGP(set.name)
        console.log(`TCG Player matches: ${JSON.stringify(tcgpMatches)}`)
        if (tcgpMatches.length != 0) {
            let exp = {
                name: set.name,
                series: set.series,
                tcgName: JSON.stringify(tcgpMatches),
                numberOfCards: 0,
                releaseDate: set.relDate,
                logoURL: await getExpLogo(set.name, set.url) ?? "",
                symbolURL: await getExpSymbol(set.name) ?? ""
            }
            consoleHeader(`Adding new Set`);
            console.log(exp)
            db.prepare(ADD).run(exp)
        }
    }
}

async function updateSets() {
    let count = 6
    consoleHeader(`Updating last ${count} expansions`);
    let exps = await getLatestExpansions(count);
    for (let exp of exps) {
        console.log(clc.green(`Processing ${exp.name}`));
        let updated = false;
        let tcgp = tcgpSets.find( tp => {stringSimilarity.compareTwoStrings(tp.value, exp.name)});
        if(tcgp != null && exp.numberOfCards != tcgp.count){
            console.log('Updating count from TCG player')
            updated = true;
            exp.numberOfCards = tcgp.count;
        }
        let pmc = pmcDbSets.find( pc => {pc.name === exp.name})
        if(pmc != null){
            console.log(`Found logo for ${exp.name}: ${pmc.logo}`)
            updated = true;
            exp.logoURL = pmc.logo
        }
        if(updated){
            console.log(`Updating ${exp.name}`)
            console.log(exp)
            db.prepare(ADD).run(exp)
        }else{
            console.log(`No Updates for ${exp.name}`)
        }
    }
}

//Finds sets from PMC marketing website
async function findNewSetsFromPR() {
    let newsets = []
    let pressRels = await scrapPmcPressReleases();
    for (let rel of pressRels) {
        let found_exp = await expantionExistsInDB(rel.name)
        console.log(`Found ${rel.name} : ${found_exp}`)
        if (found_exp == false)
            newsets.push(rel)
    }
    return newsets;
}

async function getLatestExpansions(num) {
    return await db.prepare(`SELECT * FROM expansions ORDER BY releaseDate DESC LIMIT ${num}`).all();
}

async function getLatestSeries() {
    let series = await db.prepare("SELECT * FROM series ORDER BY releaseDate DESC LIMIT 1").get();
    if (series != null) {
        return series.name
    }
    return ""
}

//Search tcgpSets for set name
async function findSetFromTCGP(name) {
    if (tcgpSets.length === 0) {
        await getTcgpExpsData();
    }
    let matches = []
    for (let tcgpSet of tcgpSets) {
        let conf = stringSimilarity.compareTwoStrings(tcgpSet.value, name)
        if (conf > 0.8) {
            matches.push(tcgpSet.urlVal)
        }
    }
    return matches;
}

//Populate the TCG Player sets
async function getTcgpExpsData() {
    let response = await fetch(`https://mpapi.tcgplayer.com/v2/search/request?q=&isList=false`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: tcgRequest
        });
    let data = await response.json();
    for (let setName of data.results[0].aggregations.setName) {
        tcgpSets.push({ urlVal: setName.urlValue, value: setName.value, count: setName.count })
    }
}

//Scrape the PMC Press release page for logo icon, name, and release date, this is the first source of data
async function scrapPmcPressReleases() {
    let response = await fetch(PMC_MARKETING_URL)
    let data = await response.text()
    let releases = []
    const { window } = new jsdom.JSDOM(data)
    const lauch_table = window.document.getElementsByTagName("tbody")[0];
    const rows = lauch_table.getElementsByTagName("tr")
    for (let i = 0; i < 5; i++) {
        let row = rows[i];
        const product = row.getElementsByClassName("prod-name")[0]
        const _date = row.getElementsByClassName("td-date")[0]
        if (product != null && _date != null) {
            let epoch = Date.parse(_date.textContent)
            if (isNaN(epoch) == false) {
                const date = new Date(epoch);
                let parts = product.textContent.replace("Pokémon TCG", "").replace(":", "").trim().split('\—');
                let name = ""
                let series = ""
                if (parts.length == 2) {
                    series = parts[0];
                    name = parts[1];
                } else {
                    name = parts[0];
                    series = await getLatestSeries();
                }
                releases.push(
                    {
                        name: name,
                        series: series,
                        url: "https://press.pokemon.com" + product.href,
                        relDate: date.toISOString()
                    }
                )
            }
        }
    }
    return releases;
}

//Get the expansion logo from the series logo from the indivdual marketing page
async function getExpLogo(name, marketingPage) {
    let response = await fetch(marketingPage)
    let data = await response.text()
    const { window } = new jsdom.JSDOM(data)
    const logo = window.document.getElementsByClassName("productLogo")[0].src;
    downloadFile(logo, `./images/exp_logo/${name.replace(" ", "-")}.jpg`)
    return logo;
}


async function getExpSymbol(name) {
    if(pmcDbSets.length == 0){
        await scrapePmcCardDBExps()
    }
    let exp = pmcDbSets.find((exp) => stringSimilarity.compareTwoStrings(name, exp.name) > 0.7)
    if (exp != null) {
        return exp.icon_url;
    } else {
        return ""
    }
}

//Checks db for an expantion 
async function expantionExistsInDB(name) {
    let results = await db.prepare(SEARCH).get(name);
    let found = results == null ? false : true;
    if (found == false) {
        let exps = await db.prepare(SEARCH).all("%%");
        for (let exp of exps) { 
            let confidence = stringSimilarity.compareTwoStrings(exp.name, name)
            if (confidence > 0.6) {
                console.log(`Expantion ${name} already found with ${confidence.toFixed(2) * 100}% confidence: ${exp.name}`)
                found = true;
            }
        }
    }
    return found;
}

//Scrapes the PMC Card Database for the exp symbol
async function scrapePmcCardDBExps() {
    let response = await fetch(PMC_CARD_DB_BASE_URL)
    let data = await response.text()
    const { window } = new jsdom.JSDOM(data)
    const series_search = window.document.getElementById("filterExpansions")
    const series_tag = series_search?.getElementsByTagName("fieldset")[0];

    if (series_tag != null) {
        let latest_series = series_tag.getElementsByTagName("h2")[0].textContent
        let exps_tags = series_tag.getElementsByTagName("li")
        for (let exp_tag of exps_tags) {
            let code = exp_tag.getElementsByTagName("input")[0].id
            let name = exp_tag.getElementsByTagName("span")[0].textContent
            let icon_url = exp_tag.getElementsByTagName("i")[0].style.backgroundImage.replace("url(", "").replace(")", "");
            pmcDbSets.push({ name: name, pmc_code: code, icon: icon_url });
        }
    }
}

async function downloadFile(url, path) {
    const res = await fetch(url);
    const fileStream = fs.createWriteStream(path);
    await new Promise((resolve, reject) => {
        res.body.pipe(fileStream);
        res.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
};

async function consoleHeader(msg) {
    console.log(clc.blueBright.bold("----------------------------------------------"))
    console.log(clc.blueBright.bold(msg))
    console.log(clc.blueBright.bold("----------------------------------------------"))
}