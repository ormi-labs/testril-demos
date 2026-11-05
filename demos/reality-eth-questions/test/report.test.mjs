import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture, fixtureBinds } from "./fixture.mjs";

const rows = () => structuredClone(fixture());
const longestLadder = (answers) => {
  const counts = Map.groupBy(answers, (a) => a.question_id);
  return [...counts.values()].sort((a, b) => b.length - a.length)[0];
};

test("check passes on the fixture, whatever order the answers arrive in", () => {
  const shuffled = rows();
  shuffled["ethereum-answers"].reverse();
  assert.equal(check({ rows: shuffled }).length, 2);
});

test("check fails on an answer to a question that was not asked", () => {
  const corrupted = rows();
  corrupted["gnosis-answers"][0].question_id = `0x${"ab".repeat(32)}`;
  assert.throws(() => check({ rows: corrupted }), /Gnosis answer .* not among/);
});

test("check scopes question ids per chain", () => {
  const corrupted = rows();
  corrupted["gnosis-answers"][0].question_id =
    corrupted["ethereum-questions"][0].question_id;
  assert.throws(() => check({ rows: corrupted }), /Gnosis answer .* not among/);
});

test("check fails when a bond is raised by less than double", () => {
  const corrupted = rows();
  const ladder = longestLadder(corrupted["ethereum-answers"]);
  ladder[2].bond = ((BigInt(ladder[1].bond) * 3n) / 2n).toString();
  assert.throws(
    () => check({ rows: corrupted }),
    /under double the previous bond/,
  );
});

test("check accepts a bond of exactly double", () => {
  const exact = rows();
  const ladder = longestLadder(exact["ethereum-answers"]);
  ladder[1].bond = (BigInt(ladder[0].bond) * 2n).toString();
  assert.doesNotThrow(() => check({ rows: exact }));
});

test("shape ranks the most contested question first with its ladder", () => {
  const view = shape({ rows: rows() }, fixtureBinds);
  assert.equal(view.mostRounds, "7");
  assert.equal(view.questions[0].answers, 7);
  assert.equal(view.contested.ladder.length, 7);
  assert.equal(view.contested.ladder[0].bond, "0.0100 ETH");
  assert.equal(view.asked, "28");
});

test("shape reports the highest bond per chain, never comparing across units", () => {
  const data = rows();
  data["gnosis-answers"].at(-1).bond = (10n ** 30n).toString();
  const view = shape({ rows: data }, fixtureBinds);
  assert.deepEqual(
    view.highestBonds.map((h) => h.chain),
    ["Ethereum", "Gnosis"],
  );
  assert.match(view.highestBonds[1].bond, /xDAI$/);
});

test("shape labels answers by template", () => {
  const data = rows();
  const question = data["ethereum-questions"][0];
  question.template_id = "1";
  const ladder = data["ethereum-answers"].filter(
    (a) => a.question_id === question.question_id,
  );
  ladder[0].answer = `0x${(42).toString(16).padStart(64, "0")}`;
  ladder[1].answer = `0x${"F".repeat(64)}`;
  const view = shape({ rows: data }, fixtureBinds);
  const row = view.questions.find((q) => q.title === question.title);
  assert.equal(row.ladder[0].answer, "42");
  assert.equal(row.ladder[1].answer, "Invalid");
});

test("shape names multiple-choice answers from the outcomes", () => {
  const view = shape({ rows: rows() }, fixtureBinds);
  const labels = view.questions.flatMap((q) => q.ladder.map((l) => l.answer));
  assert.ok(labels.includes("Team B"));
  assert.ok(labels.includes("Invalid"));
});
