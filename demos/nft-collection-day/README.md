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
| `TESTRIL_MCP_URL`   | Testril MCP endpoint; default `https://dev.testril.ai/mcp` |

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
headline numbers, a mints-vs-trades bar per approximate UTC hour (the day's
blocks split into 24 equal parts), a top-10 holder concentration bar with a
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
| Collection born | block 12876179                               | verify (start of owners read) |

- Day: 2026-11-01, blocks `[26316189, 26323365)`, found by binary search over a
  public RPC; verify.
- Pudgy Penguins finished minting in 2021, so a real fetch shows 0 mints and
  the mint cross-check has nothing to test; the test fixture has 12.
- Owners: from the collection's creation to the end of that day, so the last
  row per token is who holds it afterwards.
- Names: `erc721.collection_metadata` read at block 26323364.

## Binds (`src/report.mjs`)

Windows are half-open: the end is the first block not included.

| Name        | Function                     | Chain | Params        | Window              |
| ----------- | ---------------------------- | ----- | ------------- | ------------------- |
| `metadata`  | `erc721.collection_metadata` | 1     | `nft_address` | 26323364 → 26323365 |
| `transfers` | `erc721.transfer`            | 1     | `nft_address` | 26316189 → 26323365 |
| `owners`    | `erc721.nft_owners`          | 1     | `nft_address` | 12876179 → 26323365 |

`transfers` is read in chunks of 1,200 blocks and `owners` in chunks of
1,000,000 blocks.
