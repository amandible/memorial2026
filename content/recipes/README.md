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

## Four files are text despite their extensions

`Kirara2menu.pdf`, `MOROCCAN CARROT SALAD.doc`, `crabcakes.rtf` and `weights.rtf`
were genuinely those formats. Their text was extracted once and written back under
the original names, so provenance and URLs stay stable. The rest are byte-for-byte
copies of his files.

## Adding a recipe

Drop the file in, add a title to `_titles.json`, commit. The page is generated at
build time. The build fails loudly if the directory is empty or two files produce
the same slug.
