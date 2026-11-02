# Testril prepare

The one Testril client in this repository. It reads a demo's `testril.json`
and either prints what recording it would cost (`--plan`) or records real data
into the demo's `recordings/report.json`.

Demos never call Testril themselves; they serve the recording this tool wrote.

## Prerequisites

- Node.js 22.13 or later
- A Testril MCP URL
- For recording only: an operator key whose address holds a funded Testril
  batch-settlement channel on the quote's network. This tool signs vouchers
  against that channel and never deposits.

## Setup

Working directory: `tools/prepare`

```sh
npm ci
cp .env.example .env
```

| Variable               | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `TESTRIL_MCP_URL`      | Testril MCP endpoint, for example a local daemon      |
| `TESTRIL_OPERATOR_KEY` | Hex private key that signs vouchers; needed to record |

## Plan (free, inspect only)

```sh
node prepare.mjs --plan ../../demos/stablecoin-supply
```

For each bind: whether its chain is served or waiting, the blocks in its
window (period windows use the chain's `blocks_per_day`), and the estimated
materialize charge from the published `materialize_blocks` rate. Functions that
carry state are walked from their contract's creation and cost more than the
estimate. `--plan` never binds, materializes or reads.

## Record (paid)

```sh
node prepare.mjs ../../demos/stablecoin-supply
node prepare.mjs ../../demos/stablecoin-supply --only supply --max-jobs 2
```

Per bind: `bind`, inspect coverage, `materialize` each missing range, poll its
jobs, then `read` the window in chunks (`read.chunk_blocks` or
`read.chunk_hours`) and write the rows with `source: "dev"`, the bound function
ids, job ids and timings. The report is written after every bind, so a stopped
run resumes from the next one; materialized ranges are reused. `--max-jobs`
caps new materialize jobs in this run and leaves larger binds for the next run.
Each payment prints its charge; the run ends with the total.

## Test

```sh
npm test
npm run lint
npm run format:check
```

Tests run against an HTTP fake of Testril (`test/fake-testril.mjs`) that
checks every voucher's signature and cumulative amount.
