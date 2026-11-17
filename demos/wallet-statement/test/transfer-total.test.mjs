import test from "node:test";
import assert from "node:assert/strict";
import { nansenTotal } from "../src/transfer-total.mjs";
import { token } from "../public/model.js";

const address = (n) => "0x" + n.toString(16).padStart(40, "0");
const entry = (n, count, other = []) => ({
  counterparty_address: address(n),
  tokens_info: [...other, { token_address: token, num_transfer: count }],
});
const response = (data) => ({
  pagination: { page: 1, per_page: 1000, is_last_page: true },
  data,
});

test("total counts USDC transfers, rather than counterparties or other tokens", () => {
  const data = response([
    entry(1, "17", [{ token_address: address(9), num_transfer: "9999" }]),
    entry(2, "4"),
    { counterparty_address: address(3), tokens_info: [] },
  ]);
  const result = nansenTotal(data, token);
  assert.equal(result.count, "21");
  assert.equal(result.entries, 3);
  assert.equal(result.counterparties.length, 2);
  assert.equal(result.last, true);
});

test("total preserves integers above JavaScript's safe-number range", () => {
  assert.equal(
    nansenTotal(response([entry(1, "9007199254740993"), entry(2, "2")]), token)
      .count,
    "9007199254740995",
  );
});

test("total rejects missing counts, duplicate statistics and wrong pages", () => {
  for (const value of [null, 3, "-1", "1.5", "01"]) {
    assert.throws(() => nansenTotal(response([entry(1, value)]), token));
  }
  assert.throws(() =>
    nansenTotal(response([entry(1, "2"), entry(1, "2")]), token),
  );
  assert.throws(() =>
    nansenTotal(
      response([entry(1, "2", [{ token_address: token, num_transfer: "2" }])]),
      token,
    ),
  );
  assert.throws(() => nansenTotal(response([]), token, 2));
  assert.throws(() =>
    nansenTotal(response([{ counterparty_address: address(1) }]), token),
  );
});
