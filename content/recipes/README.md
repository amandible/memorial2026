# Joe's recipe files

The originals, copied from his machine. This directory is the source of truth for
`/recipes` — the site reads these files directly and renders them as typed.

**Do not reformat them.** The line breaks, the spacing, the second thoughts and
the notes about whose kitchen a dish came from are the point. The site strips only
the leading indentation every line in a file shares, and nothing else.

## `_titles.json`

Maps filename to display title. Generated once by the script that built his
printable cookbook, using heuristics over each file's first line — then committed
so it can be corrected by hand. A few fall back to a tidied-up filename
(`Corntomatoonion`, `Breadpud`, `Chickrol`). Edit this file to improve one; no
code change needed.

Titles are *not* used for URLs. Three of them collide, and the filenames don't —
so the URL is the filename, which also keeps his own naming visible.

## Three files are text despite their extensions

`MOROCCAN CARROT SALAD.doc`, `crabcakes.rtf` and `weights.rtf` were genuinely
those formats. Their text was extracted once and written back under the original
names, so provenance and URLs stay stable. The rest are byte-for-byte copies of
his files.

## What was removed, and why

Six files came over in the original copy that aren't recipes, or are duplicates
of one. Removed deliberately, so nobody restores them thinking it was an
accident:

- `curmudg.map` — driving directions to a private house in Napa.
- `Kirara2menu.pdf` — a restaurant's takeout order form, checkboxes and prices.
- `mangoleather` — one line naming a product and where to buy it.
- `cookie` — the Neiman-Marcus recipe printed twice in one file. The single copy
  lives in `cookie.nieman_marcus`.
- `food.doc` — three recipes concatenated, all three already present as
  `chicbroc.fud`, `dutchbaby` and `lemonpie.frz`.
- `roastcrn` — an ingredient list with no method, duplicating `cornrost.sld`,
  which has the source and the instructions.

`butter` is cannabis butter and stays, as written. It is a real lab notebook and
it is unmistakably him.

## Adding a recipe

Drop the file in, add a title to `_titles.json`, commit. The page is generated at
build time. The build fails loudly if the directory is empty or two files produce
the same slug.
