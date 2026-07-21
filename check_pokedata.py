#!/usr/bin/env python3
"""
check_pokedata.py  —  Integrity / corruption checker for the `pokedata` repo.

Run from the repository root (the folder that contains `databases/` and `images/`):

    python3 check_pokedata.py

It is READ-ONLY: the SQLite files are opened in `mode=ro` and no file is ever
modified. Uses only the Python standard library (sqlite3, os, json, re, struct,
collections, difflib) — no pip install required.

It reports:
  * SQLite structural integrity (PRAGMA integrity_check / quick_check / foreign_key_check)
  * Table inventory + row counts
  * `cards` field/ID problems: nulls, duplicates, malformed IDs, corrupted set names
  * `expansions` problems: duplicate / near-duplicate set names, count mismatches
  * `prices` problems: orphaned cardIds, bad values/dates, duplicates
  * Image tree problems: missing images, orphaned images, zero-byte / non-image files,
    duplicate set folders, and files whose embedded set prefix != their folder
"""

import os, re, json, struct, sqlite3, collections, difflib, sys

DATA_DB   = os.path.join("databases", "data.sqlite")
PRICE_DB  = os.path.join("databases", "prices.sqlite")
CARDS_DIR = os.path.join("images", "cards")

# Required columns on `cards` that should never be null/empty.
CARD_REQUIRED = ["cardId", "name", "expName", "expCardNumber"]

problems = collections.Counter()          # category -> count
def head(title): print("\n" + "=" * 78 + "\n" + title + "\n" + "=" * 78)
def note(cat, msg, n=1):
    problems[cat] += n
    print(f"  [{cat}] {msg}")

# ---------------------------------------------------------------- sqlite helpers
def connect_ro(path):
    if not os.path.exists(path):
        print(f"  !! {path} not found — skipping"); return None
    uri = "file:" + os.path.abspath(path).replace("?", "%3f") + "?mode=ro"
    return sqlite3.connect(uri, uri=True)

def tables(conn):
    return [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

def columns(conn, table):
    return [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]

def structural_checks(conn, label):
    head(f"{label}: structural integrity")
    for pragma in ("integrity_check", "quick_check"):
        rows = [r[0] for r in conn.execute(f"PRAGMA {pragma}")]
        ok = (len(rows) == 1 and rows[0] == "ok")
        print(f"  PRAGMA {pragma}: {'ok' if ok else 'PROBLEMS'}")
        if not ok:
            for r in rows[:25]:
                note("db-integrity", f"{pragma}: {r}")
    fk = list(conn.execute("PRAGMA foreign_key_check"))
    if fk:
        for r in fk[:25]:
            note("db-foreign-key", f"foreign_key_check: {r}")
    else:
        print("  PRAGMA foreign_key_check: ok")
    head(f"{label}: tables & row counts")
    for t in tables(conn):
        try:
            c = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except sqlite3.DatabaseError as e:
            note("db-read", f'could not count "{t}": {e}'); c = "?"
        print(f"  {t:<16} {c} rows   cols={columns(conn, t)}")

# --------------------------------------------------------------- data.sqlite
def norm(s):  # mirror of common.ts normalizeSetName-ish, lowercased for matching
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def check_cards(conn):
    head("data.sqlite: `cards` table checks")
    cols = columns(conn, "cards")
    rows = list(conn.execute("SELECT * FROM cards"))
    idx = {c: i for i, c in enumerate(cols)}
    print(f"  {len(rows)} card rows")

    # nulls / empties in required fields
    for col in CARD_REQUIRED:
        if col not in idx: 
            note("schema", f"expected column `{col}` missing from cards"); continue
        bad = [r for r in rows if r[idx[col]] in (None, "")]
        if bad: note("card-null", f"{len(bad)} rows with null/empty `{col}`", len(bad))

    # duplicate cardId
    if "cardId" in idx:
        dup = [k for k, v in collections.Counter(r[idx["cardId"]] for r in rows).items() if v > 1]
        for k in dup[:30]: note("card-dup-id", f"duplicate cardId: {k!r}")
        if len(dup) > 30: print(f"  ... +{len(dup)-30} more duplicate cardIds")

    # duplicate (expName, expCardNumber)
    if "expName" in idx and "expCardNumber" in idx:
        key = collections.Counter((r[idx["expName"]], r[idx["expCardNumber"]]) for r in rows)
        dup = [k for k, v in key.items() if v > 1]
        for k in dup[:30]: note("card-dup-num", f"duplicate (expName,number): {k}")
        if len(dup) > 30: print(f"  ... +{len(dup)-30} more duplicate (set,number) pairs")

    # malformed cardIds (dangling separators from uncleaned 'Name - 12/34' scrapes)
    if "cardId" in idx:
        mal = [r[idx["cardId"]] for r in rows
               if r[idx["cardId"]] and ("---" in r[idx["cardId"]]
                                        or r[idx["cardId"]].endswith("-")
                                        or "--" in r[idx["cardId"]])]
        if mal:
            note("card-malformed-id", f"{len(mal)} cardIds with '--'/'---'/trailing '-'", len(mal))
            for k in mal[:10]: print(f"        e.g. {k!r}")

    # corrupted set-name signature (the Prismatic Evolutions -> 'PriSun & Moonatic' bug,
    # and any other over-eager 'sm'->'Sun & Moon' style replacement)
    if "expName" in idx:
        sig = [r[idx["expName"]] for r in rows
               if r[idx["expName"]] and re.search(r"Sun\s*&\s*Moon", r[idx["expName"]])
               and norm(r[idx["expName"]]) not in ("sunmoon", "sunmoonpromos")]
        for v in sorted(set(sig)):
            note("card-corrupt-setname", f"suspicious expName (spliced 'Sun & Moon'): {v!r}")

    # price sanity
    if "price" in idx:
        neg = [r for r in rows if isinstance(r[idx["price"]], (int, float)) and r[idx["price"]] < 0]
        huge = [r for r in rows if isinstance(r[idx["price"]], (int, float)) and r[idx["price"]] > 100000]
        if neg:  note("card-price", f"{len(neg)} negative prices", len(neg))
        if huge: note("card-price", f"{len(huge)} prices > 100000 (likely bad)", len(huge))

    # variants column should be valid JSON
    if "variants" in idx:
        badjson = 0
        for r in rows:
            v = r[idx["variants"]]
            if v in (None, ""): continue
            try: json.loads(v)
            except Exception: badjson += 1
        if badjson: note("card-variants-json", f"{badjson} rows with non-JSON variants", badjson)

    return rows, idx

def check_expansions(conn, cards, cidx):
    head("data.sqlite: `expansions` table checks")
    if "expansions" not in tables(conn):
        note("schema", "no `expansions` table"); return
    ecols = columns(conn, "expansions")
    erows = list(conn.execute("SELECT * FROM expansions"))
    eidx = {c: i for i, c in enumerate(ecols)}
    names = [r[eidx["name"]] for r in erows] if "name" in eidx else []
    print(f"  {len(erows)} expansions")

    # exact duplicate names
    dup = [k for k, v in collections.Counter(names).items() if v > 1]
    for k in dup: note("exp-dup", f"duplicate expansion name: {k!r}")

    # near-duplicate names (catches 'Prismatic Evolutions' vs 'PriSun & Moonatic Evolutions')
    seen = []
    for n in sorted(set(names)):
        for m in seen:
            if n != m and difflib.SequenceMatcher(None, norm(n), norm(m)).ratio() > 0.72:
                note("exp-near-dup", f"near-duplicate expansion names: {n!r}  ~  {m!r}")
        seen.append(n)

    # numberOfCards vs actual card rows for that set
    if "numberOfCards" in eidx and cards and "expName" in cidx:
        by_set = collections.Counter(r[cidx["expName"]] for r in cards)
        for r in erows:
            nm, want = r[eidx["name"]], r[eidx["numberOfCards"]]
            got = by_set.get(nm, 0)
            if isinstance(want, int) and want and got and abs(got - want) > max(20, want * 0.5):
                note("exp-count", f"{nm!r}: numberOfCards={want} but {got} card rows present")

# --------------------------------------------------------------- prices.sqlite
def check_prices(price_conn, data_conn, cards, cidx):
    head("prices.sqlite: `prices` table checks")
    if price_conn is None: return
    if "prices" not in tables(price_conn):
        note("schema", "no `prices` table"); return
    pcols = columns(price_conn, "prices")
    pidx = {c: i for i, c in enumerate(pcols)}
    total = price_conn.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    print(f"  {total} price rows")

    # orphaned cardIds (present in prices but not in cards)
    if cards and "cardId" in cidx and "cardId" in pidx:
        card_ids = {r[cidx["cardId"]] for r in cards}
        price_ids = {r[0] for r in price_conn.execute("SELECT DISTINCT cardId FROM prices")}
        orphans = price_ids - card_ids
        if orphans:
            note("price-orphan", f"{len(orphans)} cardIds in prices have no matching card", len(orphans))
            for k in list(orphans)[:10]: print(f"        e.g. {k!r}")

    # bad numeric values
    for col in ("rawPrice", "gradedPriceTen", "gradedPriceNine"):
        if col in pidx:
            neg = price_conn.execute(
                f"SELECT COUNT(*) FROM prices WHERE {col} < 0").fetchone()[0]
            if neg: note("price-negative", f"{neg} rows with negative {col}", neg)

    # invalid dates (expects ISO-ish yyyy-mm-dd prefix)
    if "date" in pidx:
        bad = 0
        for (d,) in price_conn.execute("SELECT date FROM prices"):
            if not (isinstance(d, str) and re.match(r"^\d{4}-\d{2}-\d{2}", d)): bad += 1
        if bad: note("price-date", f"{bad} rows with unparseable date", bad)

    # duplicate (date, cardId, variant)
    if all(c in pidx for c in ("date", "cardId", "variant")):
        dups = price_conn.execute(
            "SELECT COUNT(*) FROM (SELECT date,cardId,variant,COUNT(*) c "
            "FROM prices GROUP BY date,cardId,variant HAVING c>1)").fetchone()[0]
        if dups: note("price-dup", f"{dups} duplicate (date,cardId,variant) groups", dups)

# --------------------------------------------------------------- image tree
JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC  = b"\x89PNG\r\n\x1a\n"

def check_images(cards, cidx):
    head("images/cards: file-tree checks")
    if not os.path.isdir(CARDS_DIR):
        note("images", f"{CARDS_DIR} not found — skipping"); return

    set_dirs = [d for d in os.listdir(CARDS_DIR)
                if os.path.isdir(os.path.join(CARDS_DIR, d))]
    print(f"  {len(set_dirs)} set folders")

    # gather every image file on disk
    disk = {}   # basename(without .jpg) -> full path
    zero, nonimg, nonjpg_ext = [], [], []
    prefix_mismatch = collections.Counter()
    folder_cardnums = collections.defaultdict(set)   # folder -> set of trailing numbers
    for d in set_dirs:
        folder = os.path.join(CARDS_DIR, d)
        want_prefix = d + "-"
        for fn in os.listdir(folder):
            fp = os.path.join(folder, fn)
            if not os.path.isfile(fp): continue
            if fn == ".DS_Store":
                note("images-junk", f".DS_Store committed in {folder}"); continue
            if not fn.lower().endswith((".jpg", ".jpeg", ".png")):
                nonjpg_ext.append(fp); continue
            size = os.path.getsize(fp)
            if size == 0:
                zero.append(fp); continue
            with open(fp, "rb") as fh: magic = fh.read(8)
            if not (magic.startswith(JPEG_MAGIC) or magic.startswith(PNG_MAGIC)):
                nonimg.append(fp)
            base = re.sub(r"\.(jpe?g|png)$", "", fn, flags=re.I)
            disk[base] = fp
            # embedded set prefix vs folder name
            if not base.startswith(want_prefix) and not fn.startswith("pokemon-back"):
                prefix_mismatch[d] += 1
            m = re.search(r"-([A-Za-z]*\d+)$", base)
            if m: folder_cardnums[d].add(m.group(1))

    if zero:   note("images-zero",  f"{len(zero)} zero-byte image files", len(zero))
    if nonimg: note("images-corrupt", f"{len(nonimg)} files without JPEG/PNG magic bytes", len(nonimg))
    for fp in nonimg[:10]: print(f"        e.g. {fp}")
    if nonjpg_ext:
        note("images-ext", f"{len(nonjpg_ext)} non-image-extension files in card folders", len(nonjpg_ext))
        for fp in nonjpg_ext[:10]: print(f"        e.g. {fp}")
    for d, n in prefix_mismatch.items():
        note("images-prefix", f"{n} files in '{d}/' carry a different set prefix than the folder name")

    # duplicate set folders (same trailing-number set) — catches Prismatic vs PriSun
    items = list(folder_cardnums.items())
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, sa = items[i]; b, sb = items[j]
            if sa and sa == sb:
                note("images-dupset",
                     f"folders '{a}/' and '{b}/' hold the SAME {len(sa)} card numbers (likely duplicate set)")

    # cross-reference DB cards -> expected image file on disk
    if cards and "cardId" in cidx:
        missing = 0
        for r in cards:
            cid = r[cidx["cardId"]]
            if not cid: continue
            base = cid.replace("/", "-")
            if base not in disk:
                missing += 1
                if missing <= 10: print(f"        missing image for cardId {cid!r}")
        if missing: note("images-missing", f"{missing} card rows have no image file on disk", missing)

        # orphaned images (on disk but no matching cardId)
        card_bases = {r[cidx["cardId"]].replace('/', '-') for r in cards if r[cidx['cardId']]}
        orphan = [p for b, p in disk.items() if b not in card_bases]
        if orphan:
            note("images-orphan", f"{len(orphan)} image files not referenced by any card row", len(orphan))
            for p in orphan[:10]: print(f"        e.g. {p}")

# --------------------------------------------------------------- main
def main():
    print("pokedata integrity check — read-only\n(run from the repo root)")
    data = connect_ro(DATA_DB)
    price = connect_ro(PRICE_DB)

    cards, cidx = [], {}
    if data:
        structural_checks(data, "data.sqlite")
        if "cards" in tables(data):
            cards, cidx = check_cards(data)
            check_expansions(data, cards, cidx)
    if price:
        structural_checks(price, "prices.sqlite")
        check_prices(price, data, cards, cidx)

    check_images(cards, cidx)

    head("SUMMARY")
    if not problems:
        print("  No problems detected. ✅")
    else:
        for cat, n in problems.most_common():
            print(f"  {cat:<22} {n}")
        print(f"\n  {sum(problems.values())} issue instances across {len(problems)} categories.")
    print()

if __name__ == "__main__":
    sys.exit(main())
