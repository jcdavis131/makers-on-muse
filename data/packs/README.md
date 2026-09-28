# Pack manifests

One JSON file per week, named `s<season>w<week>.json`. The API reads them
through `lib/packs.js`, which lists each file in a static `require` so
Vercel bundles it with the functions. Add a line there for each new week.

These files are served publicly. Never put answers, answer keys, hidden
optima, instance pools or trap verdicts in them.

Fields today:

| Field          | Meaning |
|----------------|---------|
| `schema`       | Manifest format version. |
| `id`           | `s1w1`. Also the storage key segment for the week. |
| `season`, `week` | Numbers. |
| `title`        | The pack's title. |
| `timezone`     | The zone the labels are written in. |
| `opens`        | UTC instant the week opens. Submissions are accepted from here. |
| `closes`       | UTC instant the week closes. Submissions are refused from here. |
| `range`, `opens_label`, `closes_label` | The dates as the pages print them. |

`assets/js/season.js` carries the same dates for the pages, and
`scripts/test-handlers.mjs` fails if the two disagree. Levels, pars and
blends are not in the manifest yet.

Stored submissions for a week expire 90 days after `closes`.
