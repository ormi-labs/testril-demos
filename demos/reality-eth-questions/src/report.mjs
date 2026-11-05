const dayMs = 86400000;
const isoSecond = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");

export function bindsAt(now = Date.now()) {
  const today = Math.floor(now / dayMs) * dayMs;
  const untilToday = (ms) => ({
    from_time: isoSecond(today - ms),
    to_time: isoSecond(today),
  });
  return [
    {
      name: "ethereum-questions",
      function_slug: "realitio.question",
      chain_id: 1,
      params: { realitio: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c" },
      window: untilToday(30 * dayMs),
    },
    {
      name: "ethereum-answers",
      function_slug: "realitio.answer",
      chain_id: 1,
      params: { realitio: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c" },
      window: untilToday(30 * dayMs),
    },
    {
      name: "ethereum-outcomes",
      function_slug: "realitio.question_outcomes",
      chain_id: 1,
      params: { realitio: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c" },
      window: untilToday(30 * dayMs),
    },
    {
      name: "gnosis-questions",
      function_slug: "realitio.question",
      chain_id: 100,
      params: { realitio: "0xe78996a233895be74a66f451f1019ca9734205cc" },
      window: untilToday(30 * dayMs),
    },
    {
      name: "gnosis-answers",
      function_slug: "realitio.answer",
      chain_id: 100,
      params: { realitio: "0xe78996a233895be74a66f451f1019ca9734205cc" },
      window: untilToday(30 * dayMs),
    },
    {
      name: "gnosis-outcomes",
      function_slug: "realitio.question_outcomes",
      chain_id: 100,
      params: { realitio: "0xe78996a233895be74a66f451f1019ca9734205cc" },
      window: untilToday(30 * dayMs),
    },
  ];
}

const invalidAnswer = `0x${"f".repeat(64)}`;
const topQuestions = 20;
export const unitSeparator = "␟";

export const chains = [
  { key: "ethereum", name: "Ethereum", token: "ETH" },
  { key: "gnosis", name: "Gnosis", token: "xDAI" },
];
export const windowOf = (binds, chain) =>
  binds.find((bind) => bind.name === `${chain.key}-questions`).window;

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

export function check({ rows }) {
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

function answerLabel(answer, question, outcomes) {
  if (answer.toLowerCase() === invalidAnswer) return "Invalid";
  const value = BigInt(answer);
  if (question.template_id === "0") return value === 0n ? "No" : "Yes";
  if (question.template_id === "2")
    return outcomes?.get(value) ?? `Option ${value}`;
  return String(value);
}

function questionRow(chain, question, ladder, outcomes) {
  const bonds = ladder.map((a) => BigInt(a.bond));
  const final = ladder.at(-1);
  const row = {
    chain: chain.name,
    title: question.title || question.question_text.split(unitSeparator)[0],
    category: question.category,
    answers: ladder.length,
    topBond: bonds.length ? formatBond(bonds.at(-1), chain.token) : "—",
    leading: final
      ? answerLabel(final.answer, question, outcomes)
      : "unanswered",
    ladder: ladder.map((a) => ({
      answer: answerLabel(a.answer, question, outcomes),
      bond: formatBond(a.bond, chain.token),
      level: Math.log2(Number(BigInt(a.bond) / 10n ** 12n) || 1),
    })),
  };
  return { row, topBondWei: bonds.at(-1) ?? 0n };
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

const compareBigInt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function shape({ rows }, binds) {
  const entries = chains
    .flatMap((chain, chainIndex) =>
      chainQuestions(rows, chain).map((entry) => ({ ...entry, chainIndex })),
    )
    .sort(
      (a, b) =>
        b.row.answers - a.row.answers ||
        a.chainIndex - b.chainIndex ||
        compareBigInt(b.topBondWei, a.topBondWei),
    );
  const questions = entries.map((entry) => entry.row);
  const contested = questions[0];
  const count = (key) =>
    chains.reduce((sum, chain) => sum + rows[`${chain.key}-${key}`].length, 0);
  return {
    windows: chains.map((chain) => {
      const { from_time, to_time } = windowOf(binds, chain);
      return {
        chain: chain.name,
        first: from_time.slice(0, 10),
        last: new Date(Date.parse(to_time) - dayMs).toISOString().slice(0, 10),
      };
    }),
    asked: String(count("questions")),
    answered: String(questions.filter((q) => q.answers > 0).length),
    answers: String(count("answers")),
    mostRounds: String(contested.answers),
    highestBonds: chains.map((chain, chainIndex) => {
      const wei = entries
        .filter((entry) => entry.chainIndex === chainIndex)
        .reduce(
          (top, entry) => (entry.topBondWei > top ? entry.topBondWei : top),
          0n,
        );
      return {
        chain: chain.name,
        bond: wei ? formatBond(wei, chain.token) : "—",
      };
    }),
    contested: {
      title: contested.title,
      chain: contested.chain,
      ladder: contested.ladder,
    },
    questions: questions.slice(0, topQuestions),
  };
}
