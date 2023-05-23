# Pokedata

This project is a open source web data scrapper that compiles Pokémon TCG data from multiple sources and crates a searchable database and a collection of images for the Pokémon TCG. 

Note: The LICENCE file included in this repo only pretains to the source code in the scripts directory.

Note: The information contained in the databases and images directories in the repo pretaining to the Pokémon Trading Card Game, including images and text, is copyright of The Pokémon Company, Nintendo, Game Freak, Creatures and/or Wizards of the Coast. This website is not produced by, endorsed by, supported by, or affiliated with any of these companies.  

## Build

```sh
npm run build
```

## Execution

Main script will compile to ./dist/data-scrapper.js

Run with no options or params to pull latest info from the web.

```sh
node ./dist/data-scrapper.js
```

| Options | Description |
| ------- | ----------- |
| -d      | Dry Run will save to a test file |
| -f      | Fresh dryrun will overwrite the test file and start with /databases/data.sqlite |
| -v      | verbose |

| Params | Description | Example |
| ------- | ----------- | ---- |
| -cards | update only one set | -cards="Crown Zeneith" |
