import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import { chains, windowOf } from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const firstBond = 10n ** 16n;
const invalidAnswer = `0x${"f".repeat(64)}`;
const unitSeparator = "␟";
const roundsPerQuestion = [7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0];
const titles = [
  "Will the Fed cut rates at its December meeting?",
  "Did the proposal pass the DAO vote?",
  "Will ETH close above $4,000 on 2026-12-31?",
  "Which team wins the final?",
  "Was the audit report published before 2026-11-15?",
  "Will the bridge upgrade ship this year?",
  "Did the protocol hit $1B TVL by 2026-12-01?",
  "Will the grant be awarded to Team Alpha?",
  "Does the paper replicate?",
  "Will turnout exceed 60%?",
  "Did the airdrop snapshot happen on schedule?",
  "Will the court rule before the end of Q4?",
  "Did the validator set exceed 1,000,000?",
  "Will the token list on a top-5 exchange?",
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
  roundsPerQuestion.forEach((fullRounds, index) => {
    const rounds = Math.min(fullRounds, maxRounds);
    const question_id = hex(random, 32);
    const multiChoice = index % 3 === 2;
    const block = from_block + Math.floor(random() * span * 0.5);
    const title = titles[index];
    questions.push({
      block,
      question_id,
      template_id: multiChoice ? "2" : "0",
      question_text: multiChoice
        ? `${title}${unitSeparator}"Team A","Team B","Team C"${unitSeparator}sports${unitSeparator}en_US`
        : `${title}${unitSeparator}news${unitSeparator}en_US`,
      arbitrator: hex(random, 20),
      timeout: "86400",
      opening_ts: "0",
      title,
      category: multiChoice ? "sports" : "news",
      language: "en_US",
    });
    if (multiChoice)
      ["Team A", "Team B", "Team C"].forEach((outcome, outcome_index) =>
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
      answerBlock += 1 + Math.floor(random() * ((to_block - answerBlock) / 12));
      const choice = multiChoice ? round % 3 : round % 2;
      answers.push({
        block: answerBlock,
        log_index: String(Math.floor(random() * 200)),
        tx: hex(random, 32),
        question_id,
        answer:
          index === 4 && round === rounds - 1 ? invalidAnswer : word(choice),
        bond: bond.toString(),
        ts: String(1793000000 + answerBlock),
        finalize_ts: String(1793086400 + answerBlock),
      });
      bond = bond * 2n + BigInt(Math.floor(random() * 3)) * firstBond;
    }
  });
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
