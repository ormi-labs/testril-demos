# Repository Guidelines

## Purpose & Audience

This repository contains demos showcasing [Testril](https://testril.ai), using its MCP server at `https://dev.testril.ai/mcp`. It starts private under `ormi-labs` and is intended to become public. Write every contribution for someone encountering Testril and this code for the first time.

**Readability and simplicity are primary requirements here.** Prefer a small, obvious example over a clever abstraction or an exhaustive feature showcase.

## Project Structure & Module Organization

Place each demo in `demos/<descriptive-kebab-case-name>/`, with its own README, source, tests, and assets. Each demo must be independently understandable and runnable, including after extraction from its source archive without root tooling or sibling imports. Start with multiple demos in this repository; split them into separate repositories if their setup or organization becomes confusing.

Keep programs small and independent: a parent connects children; children do not know their parent or siblings. Introduce shared code only when it makes the demos easier to read. Avoid a common framework that readers must learn before understanding an example.

## Build, Test, and Development Commands

No runtime or build tooling is selected yet. Document each demo's runtime versions and exact installation, startup, test, and build commands, including the working directory. Add formatter and linter configuration with its tooling and run applicable checks before handover.

## Coding Style & Naming Conventions

Use descriptive names, mostly pure functions, and consistent language-appropriate formatting. Follow `.editorconfig`. Use Testril's established vocabulary across arguments, fields, and errors. Avoid compatibility aliases, dead branches, and speculative abstractions. Report blockers directly.

Prefer clearer code over comments. Keep files readable; 1,500 lines is an absolute ceiling.

## Testing Guidelines

Test behavior a demo user would notice, including meaningful failure cases. Prefer realistic scenarios with peers faked at HTTP where appropriate; use values that distinguish competing interpretations. Document manual verification for visual demos. No framework or coverage threshold is prescribed yet. Do not run tests for documentation-only or string-only changes, or when no code has changed, unless Paul explicitly requests them.

## Documentation & Handover

READMEs must be clear and terse: purpose, prerequisites, copyable setup/run commands, expected result, and required configuration. Update them alongside behavior. The root README indexes runnable demos. Distinguish source downloads from exports of an individual run; document what each contains. Write plans for human engineers: use plain headings, name the work and dependencies, and state how to verify it. Avoid slogans and marketing jargon.

A commit is a complete unit; a PR groups related units. Use imperative subjects and hand over completed work through a PR with its URL. Describe user-visible changes and verification; include screenshots for interface changes.

## Public Repository Hygiene

Keep secrets out of code, examples, logs, and errors. Use placeholder configuration. Before making the repository public, review files and Git history for secrets and select an explicit license. Code and tests record implementation.
