# Move Money: treasury analysis

A local demonstration of USDC transfers, wallet balances, and source evidence
using [Testril](https://testril.ai). Move funds between Treasury, Counterparty A,
and Counterparty B, inspect the results, and see the cost of preparing and reading
data. This is a testnet example, not a mainnet treasury management application.

**Mock mode** needs no credentials: Arbitrum transfers, reads, payments, and
source evidence are simulated. **Live mode** uses Base Sepolia test USDC,
local signing, real testnet transfers, and paid Testril reads. See the
[live setup and recovery guide](docs/live.md) before configuring Live mode.

## Download and run

Requires **Node.js 22.13+**, npm, and `tar` on macOS or Linux. Git is needed for
the clone command; you can also download the repository ZIP from GitHub.
There is no build step. `npm ci` installs the locked dependencies.

```sh
git clone https://github.com/ormi-labs/testril-demos.git
cd testril-demos/demos/treasury-analysis
npm ci
npm start
```

If you already downloaded or extracted this demo, run `npm ci` and `npm start`
inside its `treasury-analysis` folder. The folder includes all required source,
fixtures, assets, documentation, and tooling; it works without the parent repository.

Open **http://127.0.0.1:4173**. The server accepts local connections only.
Stop it with **Ctrl-C**. To change the port, copy `.env.example` to `.env` and
set `PORT`. Mock mode needs no other configuration. Keys and nonzero payment
caps enable Live mode automatically.

## Try Mock mode

1. Send **0.25** from Treasury to A, then **0.10** from A to B.
2. Expect balances of **0.75 / 0.15 / 0.10 USDC**.
3. Transfer History shows UTC times and block numbers. Use Replay to watch
   transfers appear; select an arrow or a wallet balance to inspect mock
   evidence. Close the dialog with Escape or Close.
4. Payment History shows read costs and counts. Hover over a cost, or focus or
   tap it, for its breakdown. Each transfer refreshes three wallet reads and
   one history read. Mock mode assumes data is prepared and has no
   materialization charges. Startup charges three simulated balance reads.
5. Reset demo returns funds to Treasury, clears both histories, restores the
   mock payer, and resets costs to zero. Reset adds no mock charge.

Switching tabs, replay, and inspecting provenance are free. Reloading resumes
the tab's session; restarting the server clears mock sessions. On phones, scroll
the transfer diagram horizontally.

## Source and run exports

**Download source** opens [this demo's GitHub directory](https://github.com/ormi-labs/testril-demos/tree/main/demos/treasury-analysis).
Clone or download the repository for the application and locked dependencies.
Source downloads exclude your local `.env`, saved live state, and installed dependencies.

A **run export** is a separate archive available at
`/api/sessions/<session-id>/export`. It contains `run.json`, a README, and
separate JSON files for transfers, balances, receipts, and provenance. It contains
run data, not the application. Mock evidence is fictional. Live evidence contains
RPC receipts, cached Testril results, and any provenance citations requested.

From the demo directory:

```sh
node src/cli.mjs sample run.json
node src/cli.mjs replay run.json
# After extracting a run archive:
node src/cli.mjs replay /path/to/run/run.json
```

Mock replay checks transfer arithmetic. Live replay displays cached Testril
balances; it does not calculate historical wallet balances. Neither verifies
chain or MCP evidence independently. Raw USDC amounts are six-decimal integer
strings: `"250000"` represents 0.25 USDC.

## Further documentation

- [Live setup, payments, indexing, and recovery](docs/live.md)
- [Code map, development checks, and embedding](docs/development.md)
- [Design asset origins](public/assets/README.md)

Live mode supports Base Sepolia only. It reads wallet snapshots and per-block
transfer edges. It does not provide mainnet access, wallet-wide historical
analysis, or independent verification of every source log. Testril supplies
balances, transfer edges, chain-head metadata, and citations; the local signer
uses RPC to prepare, submit, and confirm transactions.

## License

[MIT](LICENSE).
