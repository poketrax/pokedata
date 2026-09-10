# Multi-Language Support Guide

## Overview

This fork adds support for scraping both English and Japanese Pokemon TCG card data.

## Setup

### 1. Run Database Migration

Before using the language parameter, run the migration to add language fields:

```bash
sqlite3 databases/data.sqlite < migrations/add_language_field.sql
```

### 2. Build the Project

```bash
npm run build
```

## Usage

### Scrape English Cards (Default)

```bash
# All commands default to English
node ./dist/data-scrapper.js -v

# Explicitly specify English
node ./dist/data-scrapper.js --lang=en -v
```

### Scrape Japanese Cards

```bash
# Use --lang=jp or -l jp
node ./dist/data-scrapper.js --lang=jp -v

# Short form
node ./dist/data-scrapper.js -l jp -v

# Dry run test
node ./dist/data-scrapper.js --lang=jp -d -f -v
```

### Update Specific Set

```bash
# English set
node ./dist/data-scrapper.js --cards="Surging Sparks" --lang=en -v

# Japanese set
node ./dist/data-scrapper.js --cards="黒の雷鳴" --lang=jp -v
```

## Data Sources

### English Cards
- **Serebii**: `https://www.serebii.net/card/english.shtml`
- **Promos**: `https://www.serebii.net/card/engpromo.shtml`
- **TCGPlayer**: English market prices
- **eBay**: eBay.com (US market)

### Japanese Cards
- **Serebii**: `https://www.serebii.net/card/japanese.shtml`
- **Promos**: `https://www.serebii.net/card/jppromo.shtml`
- **TCGPlayer**: Japanese product line
- **eBay**: eBay.com (may need adjustment for Japanese market)

## Database Schema

### New Fields

Both `expansions` and `cards` tables now include:

```sql
language TEXT DEFAULT 'en'  -- 'en' for English, 'jp' for Japanese
```

### Query Examples

```sql
-- Get all English cards
SELECT * FROM cards WHERE language = 'en';

-- Get all Japanese cards
SELECT * FROM cards WHERE language = 'jp';

-- Get cards from both languages
SELECT * FROM cards WHERE name LIKE '%Pikachu%';

-- Count cards by language
SELECT language, COUNT(*) FROM cards GROUP BY language;
```

## Price Scraper

The price scraper (`price-scrapper.js`) will automatically use the language from the card data:

```bash
# Update prices for English cards
node ./dist/price-scrapper.js -h -v

# Update prices for Japanese cards (after scraping JP data)
node ./dist/price-scrapper.js -h -v
```

## Integration with CardTrail

### Step 1: Scrape Japanese Data

```bash
cd /Users/roy-songzhe-li/Desktop/Personal\ Projects/PTCG/pokedata
node ./dist/data-scrapper.js --lang=jp -v
```

### Step 2: Export to CardTrail Format

Create a sync script in your CardTrail project:

```typescript
// cardtrail-app/packages/price-sync/src/sync-from-pokedata.ts
import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';

const pokedataDb = new Database('/path/to/pokedata/databases/data.sqlite');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function syncJapaneseCards() {
  // Get Japanese cards from pokedata
  const cards = pokedataDb.prepare(`
    SELECT * FROM cards WHERE language = 'jp'
  `).all();
  
  // Map to CardTrail schema and insert
  for (const card of cards) {
    await supabase.from('card_jp').upsert({
      // Map fields here
    });
  }
}
```

## Command Reference

| Command | Description |
|---------|-------------|
| `--lang=en` or `-l en` | Scrape English cards (default) |
| `--lang=jp` or `-l jp` | Scrape Japanese cards |
| `-d` or `--dryrun` | Test mode, no database changes |
| `-f` or `--fresh` | Fresh dry run, copy from main DB |
| `-v` or `--verbose` | Verbose logging |
| `--cards="Set Name"` | Update specific set only |

## Examples

### Daily Update Workflow

```bash
# Morning: Update English cards
node ./dist/data-scrapper.js --lang=en -v

# Evening: Update Japanese cards
node ./dist/data-scrapper.js --lang=jp -v

# Weekly: Update prices for both
node ./dist/price-scrapper.js -h -v
```

### Testing New Language Support

```bash
# Test Japanese scraping without modifying database
node ./dist/data-scrapper.js --lang=jp -d -f -v

# Check results
sqlite3 test-data.sqlite "SELECT COUNT(*), language FROM cards GROUP BY language;"
```

## Troubleshooting

### Migration Failed

If you see "no such column: language":

```bash
# Re-run migration
sqlite3 databases/data.sqlite < migrations/add_language_field.sql
```

### No Data Scraped

Check Serebii availability:

```bash
curl -I https://www.serebii.net/card/japanese.shtml
```

### Mixed Language Data

To separate databases by language:

```bash
# Create separate databases
cp databases/data.sqlite databases/data-en.sqlite
cp databases/data.sqlite databases/data-jp.sqlite

# Clean up
sqlite3 databases/data-en.sqlite "DELETE FROM cards WHERE language = 'jp';"
sqlite3 databases/data-jp.sqlite "DELETE FROM cards WHERE language = 'en';"
```

## Contributing

When adding new features, ensure they support both languages:

1. Add language parameter to functions
2. Update database queries to filter by language
3. Test with both `--lang=en` and `--lang=jp`
4. Update this guide

## License

Same as original pokedata project (MIT)

