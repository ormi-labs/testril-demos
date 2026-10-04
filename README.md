# Testril demos

Small, runnable demos showcasing [Testril](https://testril.ai).

MCP server: `https://dev.testril.ai/mcp`

## Demo plan

Start with the [two-page brief](docs/demo-summary.pdf) ([Markdown](docs/demo-summary.md)). The [detailed plan](docs/demo-strategy.md) describes what to build, in what order, and how to verify it. [Download specifications](docs/demo-deliverables.md) describe the proposed applications and exports, with a [treasury screen sketch](docs/treasury-preview.svg). [Function requirements](docs/function-briefs.md) specify the backend work. The [first-release build specification](docs/specs/first-release-data-functions.md) is ready to hand to an implementing agent.

To refresh the PDF, install `reportlab` in a Python environment and run `python docs/render_summary.py`.

## Demos

| Demo | Run | Status |
| --- | --- | --- |
| [Treasury analysis](demos/treasury-analysis/README.md) | `cd demos/treasury-analysis && npm ci && npm start` | Runnable fictional sample, CLI, verifier, and source/run downloads. Live integration awaits transfer edges and a paid client. |

The treasury interface follows the approved derivative style guide from `testril-website`. It runs locally with Node.js 22.13+ on macOS or Linux. See its README for exact prerequisites, expected results, and checks. Preview the [desktop](docs/screenshots/treasury-desktop.png) and [mobile](docs/screenshots/treasury-mobile.png) screens as PNGs.

`sub-cent-reads` and `paid-reader` remain planned independent CLI downloads. No hosted demo or public release has been published.

## Contributing

Read [AGENTS.md](AGENTS.md). Keep each demo self-contained, readable, and simple. Its README should explain what it shows, how to run it, and what to expect.

## Status

This repository starts private and is intended to become public. No license has been selected yet.
