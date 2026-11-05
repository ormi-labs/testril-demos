# NFT collection day

One day of a blue-chip ERC-721 collection on Ethereum: how many tokens were
minted and how many traded, hour by hour, and how concentrated the holders are
after the last block of the day. The page proves its numbers with three
cross-checks: mints come from the zero address and only for tokens with no
earlier owner, every transferred token has exactly one owner row per block
naming the receiver of that block's last transfer, and the holder balances
match the distinct owners in the owner rows.

Every number on the page comes live from Testril when you press **Fetch from
Testril**. The first fetch has Testril index the data; later fetches only read
what Testril already indexed.

## Prerequisites

- Node.js 22.13 or later
- A private key whose address holds Testril usage credits. The demo pays with
  vouchers against those credits, so the wallet needs no USDC.

| Variable            | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `TESTRIL_PAYER_KEY` | Hex private key that signs vouchers; required to fetch     |
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://api.testril.si/mcp` |

## Run

Working directory: `demos/nft-collection-day`

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
headline numbers, a mints-vs-trades bar per UTC hour (one bind per hour), a top-10 holder concentration bar with a
table, and three cross-checks. Nothing is saved: a restart starts empty
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

`npm test` checks the cross-checks pass on the fixture and fail when a mint
comes from a holder, when a token with an earlier owner is called a mint, when
an owner row is missing or duplicated, when a double transfer in one block
names the wrong owner, and when a transfer's sender is not the token's owner, and that the server returns the shaped report.
`npm test` also fetches from a fake Testril: the fetch pays with the payer's
vouchers, reports Testril's job progress and keeps every row.
`npm run test:browser` presses the button against the fake Testril and waits
for the report. The fixture lives in `test/` and is never shown on the page.

## Subjects and window

| Subject         | Address                                      | Note                          |
| --------------- | -------------------------------------------- | ----------------------------- |
| Pudgy Penguins  | `0xbd3531da5cf5857e7cfaa92426877b022e612cf8` | verify                        |
| Collection born | 2021-07-22T12:26:01Z (block 12876179)        | verify (start of owners read) |

- Day: the UTC day before the day of the press (yesterday, 00:00 to 24:00),
  read in 24 one-hour chunks; a transfer's hour is the chunk whose resolved
  block range holds its block, and the check fails on a transfer outside them.
- Pudgy Penguins finished minting in 2021, so a real fetch shows 0 mints and
  the mint cross-check has nothing to test; the test fixture has 12.
- Owners: from the collection's creation to the end of that day, so the last
  row per token is who holds it afterwards. A row is "before the day" when its
  block is below the first block of the day's transfers read.
- Names: `erc721.collection_metadata` read over the last five minutes before the
  end of that day.

## Binds (`src/report.mjs`)

Windows end at 00:00 UTC on the day of the press; the end is not included.

| Name        | Function                     | Chain | Params        | Window            |
| ----------- | ---------------------------- | ----- | ------------- | ----------------- |
| `metadata`  | `erc721.collection_metadata` | 1     | `nft_address` | 5 minutes → today |
| `transfers` | `erc721.transfer`            | 1     | `nft_address` | yesterday         |
| `owners`    | `erc721.nft_owners`          | 1     | `nft_address` | creation → today  |

`owners` is read in chunks of 2,400 hours.
