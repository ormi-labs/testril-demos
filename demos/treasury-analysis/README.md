# Wallet transfers

Move **1 USDC** between Treasury, Counterparty A, and Counterparty B. Read their
balances with Testril, replay the transfers, and select an arrow to inspect provenance.

**Everything is mocked:** Arbitrum, USDC, wallets, transfers, Testril reads,
prices, timestamps, and hashes. No funds move or payments occur. This version
checks the interaction before live integration.

## Run

Requires Node.js **22.13+**, npm, and `tar` on macOS or Linux. No build step or
runtime dependencies.

```sh
cd demos/treasury-analysis  # or the extracted treasury-analysis folder
npm ci
npm start
```

Open **http://127.0.0.1:4173**. Optional: copy `.env.example` to `.env` to change
`PORT`. No keys or credentials are needed. The server accepts local connections only.

## Try it

1. Transfer **0.25** from Treasury to A, then **0.10** from A to B.
2. Expect balances **0.75 / 0.15 / 0.10 USDC**.
3. Select **Show transfers**. Replay reveals arrows with UTC times and block numbers.
   The diagram keeps Treasury in the middle and counterparties on either side,
   with one row per transfer in chronological order.
   Pause, scrub, or replay again; select an arrow to open mock source evidence in a modal.
   Close it with Escape or the Close button.
   On phones, scroll the diagram horizontally.
4. Select **Reset demo**. Return transfers restore **1 / 0 / 0** and start a fresh history.

The first screen puts transfers and balances in one workspace. **Show transfers**
opens the replay; **Read details** opens payment receipts and the last reset evidence.

Each balance refresh makes three simulated paid reads. History is read on demand;
replay and provenance inspection are free. A separate mock payment wallet covers
reads; its accumulated charges survive reset. Rates are illustrative. Refreshing
resumes the tab’s session; restarting the server clears sessions. Data preparation
is assumed, so this version has no materialization or supplier earnings.

## Downloads and CLI

**Download source** exports this standalone project, locked tools, and a digest
manifest, excluding local configuration and installed dependencies. **Export this run**
contains transfers, balances, receipts, and fictional provenance.

```sh
node src/cli.mjs sample run.json
node src/cli.mjs replay run.json
```

Replay checks balance arithmetic; it does not verify Arbitrum evidence. Downloads
are for private evaluation until a repository license is selected.

## Development

```sh
npm test
npm run lint
npm run format:check
npx playwright install chromium
npm run test:browser  # desktop + mobile; local port 4175
```

`src/mock-chain.mjs` simulates transfers; `src/mock-testril.mjs` simulates reads.
`src/demo.mjs` connects them. `public/` holds the plain JavaScript interface;
`fixtures/demo.json` sets wallets and rates. Amounts use integer strings and BigInt.
For visual review, try the sequence above on desktop and phone, including keyboard
provenance selection. Asset origins are in `public/assets/README.md`.

## Live integration later

Real payment and transfer keys must stay in server secret storage, never browser
code or source downloads. The server will need restricted destinations and spending
limits. Confirm Arbitrum USDC payment support and deployed function contracts first.
Transaction timestamps and individual source events need additional witnesses
beyond aggregated transfer edges. This mock implements none of those live services.
