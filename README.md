# Testril demos

Small, runnable demos showcasing [Testril](https://testril.ai).

MCP server: `https://dev.testril.ai/mcp`

## Demos

| Demo | Run | Status |
| --- | --- | --- |
| [Move Money](demos/treasury-analysis/README.md) | `cd demos/treasury-analysis && npm ci && npm start` | Interactive mock: move 1 USDC between three wallets, inspect balance and transfer provenance, follow automatically updated transfer/payment histories, replay, reset, and download the source. |

The interface follows Testril’s approved derivative style guide. It runs locally with Node.js 22.13+ on macOS or Linux. Preview the landing screen on [desktop](docs/screenshots/treasury-landing-desktop.png) and [mobile](docs/screenshots/treasury-landing-mobile.png), the [transfer replay](docs/screenshots/treasury-desktop.png), and the [provenance modal](docs/screenshots/treasury-provenance-desktop.png).

Everything in the current demo is simulated, including Arbitrum transactions, Testril reads, payment charges, and source evidence. No wallet or credentials are required. `sub-cent-reads` and `paid-reader` remain planned independent downloads.

## Plans

The [two-page brief](docs/demo-summary.pdf) ([Markdown](docs/demo-summary.md)) and [detailed plan](docs/demo-strategy.md) describe the broader demo series. [Download specifications](docs/demo-deliverables.md) describe proposed applications and exports; the [treasury sketch](docs/treasury-preview.svg) is an earlier design. [Function requirements](docs/function-briefs.md) and the [first-release build specification](docs/specs/first-release-data-functions.md) describe backend work for live integration.

The runnable demo’s README describes its current behavior; these planning documents cover future capabilities. To refresh the brief PDF, install `reportlab` and run `python docs/render_summary.py`.

## Contributing

Read [AGENTS.md](AGENTS.md). Keep each demo self-contained, readable, and simple. Its README should explain what it shows, how to run it, and what to expect.

## Status

This repository is private and intended to become public. No license has been selected yet. No hosted demo or public release has been published.
