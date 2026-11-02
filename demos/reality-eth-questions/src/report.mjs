import spec from "../testril.json" with { type: "json" };

const invalidAnswer = `0x${"f".repeat(64)}`;
const topQuestions = 20;

export const chains = [
  { key: "ethereum", name: "Ethereum", token: "ETH" },
  { key: "gnosis", name: "Gnosis", token: "xDAI" },
];
const binds = Object.fromEntries(spec.binds.map((bind) => [bind.name, bind]));
export const windowOf = (chain) => binds[`${chain.key}-questions`].window;

const answerOrder = (a, b) =>
  a.block - b.block || Number(BigInt(a.log_index) - BigInt(b.log_index));

export function ladders(rows, chain) {
  const byQuestion = new Map();
  for (const answer of [...rows[`${chain.key}-answers`]].sort(answerOrder)) {
    const ladder = byQuestion.get(answer.question_id) ?? [];
    ladder.push(answer);
    byQuestion.set(answer.question_id, ladder);
  }
  return byQuestion;
}

function checkChain(rows, chain) {
  const questionIds = new Set(
    rows[`${chain.key}-questions`].map((q) => q.question_id),
  );
  const byQuestion = ladders(rows, chain);
  for (const [questionId, ladder] of byQuestion) {
    if (!questionIds.has(questionId))
      throw new Error(
        `${chain.name} answer at block ${ladder[0].block} is for question ${questionId}, which is not among its questions.`,
      );
    for (let i = 1; i < ladder.length; i++)
      if (BigInt(ladder[i].bond) < 2n * BigInt(ladder[i - 1].bond))
        throw new Error(
          `${chain.name} question ${questionId}: bond ${ladder[i].bond} at block ${ladder[i].block} is under double the previous bond ${ladder[i - 1].bond}.`,
        );
  }
  return {
    answers: rows[`${chain.key}-answers`].length,
    questions: questionIds.size,
  };
}

export function check(rows) {
  return chains.flatMap((chain) => {
    const { answers, questions } = checkChain(rows, chain);
    return [
      `${chain.name}: all ${answers} answers belong to one of the ${questions} questions asked in the window, and every bond is at least double the one before it`,
    ];
  });
}

export function formatBond(wei, token) {
  const tokens = Number(BigInt(wei) / 10n ** 12n) / 1e6;
  return `${tokens.toFixed(tokens < 1 ? 4 : 2)} ${token}`;
}

function answerLabel(answer, outcomes) {
  if (answer === invalidAnswer) return "Invalid";
  const index = BigInt(answer);
  if (outcomes?.has(index)) return outcomes.get(index);
  return index === 0n ? "No" : index === 1n ? "Yes" : `Option ${index}`;
}

function questionRow(chain, question, ladder, outcomes) {
  const bonds = ladder.map((a) => BigInt(a.bond));
  const final = ladder.at(-1);
  return {
    chain: chain.name,
    title: question.title || question.question_text.split("␟")[0],
    category: question.category,
    answers: ladder.length,
    topBond: bonds.length ? formatBond(bonds.at(-1), chain.token) : "—",
    topBondWei: bonds.at(-1) ?? 0n,
    leading: final ? answerLabel(final.answer, outcomes) : "unanswered",
    ladder: ladder.map((a) => ({
      answer: answerLabel(a.answer, outcomes),
      bond: formatBond(a.bond, chain.token),
      level: Math.log2(Number(BigInt(a.bond) / 10n ** 12n) || 1),
    })),
  };
}

function chainQuestions(rows, chain) {
  const byQuestion = ladders(rows, chain);
  const outcomes = new Map();
  for (const o of rows[`${chain.key}-outcomes`]) {
    const options = outcomes.get(o.question_id) ?? new Map();
    options.set(BigInt(o.outcome_index), o.outcome);
    outcomes.set(o.question_id, options);
  }
  return rows[`${chain.key}-questions`].map((question) =>
    questionRow(
      chain,
      question,
      byQuestion.get(question.question_id) ?? [],
      outcomes.get(question.question_id),
    ),
  );
}

export function shape(rows) {
  const questions = chains
    .flatMap((chain) => chainQuestions(rows, chain))
    .sort(
      (a, b) =>
        b.answers - a.answers ||
        (b.topBondWei > a.topBondWei
          ? 1
          : b.topBondWei < a.topBondWei
            ? -1
            : 0),
    );
  const contested = questions[0];
  const count = (key) =>
    chains.reduce((sum, chain) => sum + rows[`${chain.key}-${key}`].length, 0);
  return {
    windows: chains.map((chain) => ({
      chain: chain.name,
      ...windowOf(chain),
    })),
    asked: String(count("questions")),
    answered: String(questions.filter((q) => q.answers > 0).length),
    answers: String(count("answers")),
    mostRounds: String(contested.answers),
    highestBond: questions.reduce((top, q) =>
      q.topBondWei > top.topBondWei ? q : top,
    ).topBond,
    contested: {
      title: contested.title,
      chain: contested.chain,
      ladder: contested.ladder,
    },
    questions: questions.slice(0, topQuestions).map(displayable),
  };
}

function displayable(question) {
  const display = { ...question };
  delete display.topBondWei;
  return display;
}
