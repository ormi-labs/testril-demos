import { test } from "node:test";
import assert from "node:assert/strict";
import { check, shape } from "../src/report.mjs";
import { fixture } from "./fixture.mjs";

const rows = () => structuredClone(fixture().rows);
const longestLadder = (answers) => {
  const counts = Map.groupBy(answers, (a) => a.question_id);
  return [...counts.values()].sort((a, b) => b.length - a.length)[0];
};

test("check passes on the fixture, whatever order the answers arrive in", () => {
  const shuffled = rows();
  shuffled["ethereum-answers"].reverse();
  assert.equal(check(shuffled).length, 2);
});

test("check fails on an answer to a question that was not asked", () => {
  const corrupted = rows();
  corrupted["gnosis-answers"][0].question_id = `0x${"ab".repeat(32)}`;
  assert.throws(() => check(corrupted), /Gnosis answer .* not among/);
});

test("check fails when a bond is raised by less than double", () => {
  const corrupted = rows();
  const ladder = longestLadder(corrupted["ethereum-answers"]);
  ladder[2].bond = ((BigInt(ladder[1].bond) * 3n) / 2n).toString();
  assert.throws(() => check(corrupted), /under double the previous bond/);
});

test("check accepts a bond of exactly double", () => {
  const exact = rows();
  const ladder = longestLadder(exact["ethereum-answers"]);
  ladder[1].bond = (BigInt(ladder[0].bond) * 2n).toString();
  assert.doesNotThrow(() => check(exact));
});

test("shape ranks the most contested question first with its ladder", () => {
  const view = shape(rows());
  assert.equal(view.mostRounds, "7");
  assert.equal(view.questions[0].answers, 7);
  assert.equal(view.contested.ladder.length, 7);
  assert.equal(view.contested.ladder[0].bond, "0.0100 ETH");
  assert.equal(view.asked, "28");
});

test("shape names multiple-choice answers from the outcomes", () => {
  const view = shape(rows());
  const labels = view.questions.flatMap((q) => q.ladder.map((l) => l.answer));
  assert.ok(labels.includes("Team B"));
  assert.ok(labels.includes("Invalid"));
});
