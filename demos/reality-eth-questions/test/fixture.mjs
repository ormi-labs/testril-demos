import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { chains, unitSeparator, windowOf } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const firstBond = 10n ** 16n;
const invalidAnswer = `0x${"f".repeat(64)}`;
const teams = ["Team A", "Team B", "Team C"];
const windowStartTs = Date.UTC(2026, 9, 3) / 1000;
const timeoutSeconds = 86400;
const blockSeconds = { ethereum: 12, gnosis: 5 };
const roundsPerQuestion = [7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0];
const questionSpecs = [
  { title: "Will the Fed cut rates at its December meeting?" },
  { title: "Did the proposal pass the DAO vote?" },
  { title: "Will ETH close above $4,000 on 2026-12-31?" },
  { title: "Which team wins the final?", category: "sports", outcomes: teams },
  { title: "Was the audit report published before 2026-11-15?" },
  { title: "Will the bridge upgrade ship this year?" },
  { title: "Did the protocol hit $1B TVL by 2026-12-01?" },
  {
    title: "Which team is awarded the grant?",
    category: "grants",
    outcomes: teams,
  },
  { title: "Does the paper replicate?" },
  { title: "Will turnout exceed 60%?" },
  { title: "Did the airdrop snapshot happen on schedule?" },
  { title: "Will the court rule before the end of Q4?" },
  { title: "Did the validator set exceed 1,000,000?" },
  { title: "Will the token list on a top-5 exchange?" },
];

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const hex = (random, bytes) =>
  `0x${Array.from({ length: bytes }, () =>
    Math.floor(random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
const word = (index) => `0x${index.toString(16).padStart(64, "0")}`;

function chainRows(chain, random) {
  const { from_block, to_block } = windowOf(chain);
  const span = to_block - from_block;
  const questions = [];
  const answers = [];
  const outcomes = [];
  const maxRounds = chain.key === "gnosis" ? 6 : 7;
  questionSpecs.forEach(
    ({ title, category = "news", outcomes: options }, index) => {
      const rounds = Math.min(roundsPerQuestion[index], maxRounds);
      const question_id = hex(random, 32);
      const block = from_block + Math.floor(random() * span * 0.5);
      questions.push({
        block,
        question_id,
        template_id: options ? "2" : "0",
        question_text: [
          title,
          ...(options ? [options.map((o) => `"${o}"`).join(",")] : []),
          category,
          "en_US",
        ].join(unitSeparator),
        arbitrator: hex(random, 20),
        timeout: String(timeoutSeconds),
        opening_ts: "0",
        title,
        category,
        language: "en_US",
      });
      if (options)
        options.forEach((outcome, outcome_index) =>
          outcomes.push({
            block,
            question_id,
            outcome_index: String(outcome_index),
            outcome,
          }),
        );
      let bond = firstBond;
      let answerBlock = block + 10;
      for (let round = 0; round < rounds; round++) {
        answerBlock +=
          1 + Math.floor(random() * ((to_block - answerBlock) / 12));
        const ts =
          windowStartTs + (answerBlock - from_block) * blockSeconds[chain.key];
        const choice = round % (options?.length ?? 2);
        answers.push({
          block: answerBlock,
          log_index: String(Math.floor(random() * 200)),
          tx: hex(random, 32),
          question_id,
          answer:
            index === 4 && round === rounds - 1 ? invalidAnswer : word(choice),
          bond: bond.toString(),
          ts: String(ts),
          finalize_ts: String(ts + timeoutSeconds),
        });
        bond = bond * 2n + BigInt(Math.floor(random() * 3)) * firstBond;
      }
    },
  );
  return {
    [`${chain.key}-questions`]: questions,
    [`${chain.key}-answers`]: answers,
    [`${chain.key}-outcomes`]: outcomes,
  };
}

export function fixture() {
  const random = seeded(11);
  return {
    demo: spec.demo,
    source: "synthetic",
    recordedAt,
    boundFunctions: Object.fromEntries(
      spec.binds.map((bind) => [
        bind.name,
        { function_slug: bind.function_slug, chain_id: bind.chain_id },
      ]),
    ),
    window: Object.fromEntries(spec.binds.map((b) => [b.name, b.window])),
    rows: Object.assign({}, ...chains.map((chain) => chainRows(chain, random))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
