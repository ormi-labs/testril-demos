# Reality.eth questions

Questions asked on Reality.eth v3 on Ethereum and Gnosis over the last 30 days,
and the answers given to them. Each new answer must stake at least double the
bond of the one before, so a disputed question climbs a ladder of bonds. The
page shows the most disputed question's ladder and a table of the 20 questions
with the most answers. It proves its numbers: every answer must belong to a
question asked in the window, and every bond must be at least double the
previous bond on the same question.

Every number on the page comes live from Testril when you press **Fetch from
Testril**. The first fetch has Testril index the data; later fetches only read
what Testril already indexed. A real fetch can fail the cross-check, and the
page then shows the failure instead of the passed checks, when:

- an answer in the window belongs to a question asked before it;
- an answer does not beat the previous bond, because `realitio.answer` keeps a
  row for a bond that does not beat the question's bond;
- an answer was revealed from a commitment: its row sits at the reveal block,
  not where it was committed, so block order can misplace it.

## Prerequisites

- Node.js 22.13 or later
- A private key whose address holds Testril usage credits. The demo pays with
  vouchers against those credits, so the wallet needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to fetch     |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

## Run

Working directory: `demos/reality-eth-questions`

```sh
npm ci
export TESTRIL_PAYER_KEY=<hex private key>
npm start
```

Open http://127.0.0.1:4180 (set `PORT` to change it) and press **Fetch from
Testril**. For each bind the server calls `bind`, asks `materialize` for the
whole window (Testril charges only for what it has not indexed yet), follows the
job, then `read`s the window. The page shows a bar per bind and overall from
Testril's own job progress and the usage credits spent. Then it draws four
headline numbers, the bond ladder of the most disputed question, a table of 20
questions and two cross-checks. Nothing is saved: a restart starts empty
and the next fetch reads again.

Without `TESTRIL_PAYER_KEY` the button is disabled and the page says what to set.

## Test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run lint
npm run format:check
```

`npm test` checks the cross-check passes on the fixture (also when answers
arrive out of order, and for a bond of exactly double), fails on an answer to an
unknown question and on a bond raised by only 1.5 times, and that the server
returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

| Subject                 | Chain        | Address                                      | Note   |
| ----------------------- | ------------ | -------------------------------------------- | ------ |
| Reality.eth v3 (native) | Ethereum (1) | `0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c` | verify |
| Reality.eth v3 (native) | Gnosis (100) | `0xe78996a233895be74a66f451f1019ca9734205cc` | verify |

Both addresses hold contract code on their chain's public RPC; confirm they are
the v3 native-token deployments before fetching. Bonds are in raw wei: ETH on
Ethereum and xDAI on Gnosis, both 18 decimals.

The window is 30 UTC days ending 2026-11-01, as a block window (half-open),
found by binary search over public RPCs, not through Testril:

- Ethereum: `[26108082, 26323365)`, the first block of 2026-10-03 to the first
  block of 2026-11-02.
- Gnosis: `[48558286, 49062480)`, the same days.

Gnosis is not yet served by Testril, so its binds are declared but cannot be
fetched until it is.

## Binds (`src/report.mjs`)

| Name                 | Function                     | Chain | Params     | Window              |
| -------------------- | ---------------------------- | ----- | ---------- | ------------------- |
| `ethereum-questions` | `realitio.question`          | 1     | `realitio` | 26108082 → 26323365 |
| `ethereum-answers`   | `realitio.answer`            | 1     | `realitio` | 26108082 → 26323365 |
| `ethereum-outcomes`  | `realitio.question_outcomes` | 1     | `realitio` | 26108082 → 26323365 |
| `gnosis-questions`   | `realitio.question`          | 100   | `realitio` | 48558286 → 49062480 |
| `gnosis-answers`     | `realitio.answer`            | 100   | `realitio` | 48558286 → 49062480 |
| `gnosis-outcomes`    | `realitio.question_outcomes` | 100   | `realitio` | 48558286 → 49062480 |
