# Testril demos

Small, runnable demos showcasing [Testril](https://testril.ai).

MCP server: `https://dev.testril.ai/mcp`

## Demo plan

Start with the [two-page brief](docs/demo-summary.pdf) ([Markdown](docs/demo-summary.md)). The [detailed plan](docs/demo-strategy.md) describes what to build, in what order, and how to verify it. [Download specifications](docs/demo-deliverables.md) describe the proposed applications and exports, with a [treasury screen sketch](docs/treasury-preview.svg). [Function requirements](docs/function-briefs.md) specify the backend work. The [first-release build specification](docs/specs/first-release-data-functions.md) is ready to hand to an implementing agent.

To refresh the PDF, install `reportlab` in a Python environment and run `python docs/render_summary.py`.

## Demos

No runnable demos yet. The first release is planned as three independent downloads: `sub-cent-reads` (CLI), `treasury-analysis` (web application, client, and verifier), and `paid-reader` (CLI). Each will live in `demos/<name>/` with its own setup and run instructions. Runnable releases will be linked here.

## Contributing

Read [AGENTS.md](AGENTS.md). Keep each demo self-contained, readable, and simple. Its README should explain what it shows, how to run it, and what to expect.

## Status

This repository starts private and is intended to become public. No license has been selected yet.
