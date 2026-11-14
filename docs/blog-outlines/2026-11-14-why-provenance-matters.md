# Why Provenance Matters

Blog outline and complete verification appendix · 14 November 2026.

## The argument

We were building a demo comparing Nansen and Testril pricing. Before comparing anything else, we needed to establish that they answered the same question correctly. A discrepancy turned that preliminary check into a demonstration of why an answer should come with a way to verify it.

Our knowledge of Nansen's separate services let us investigate its answer. Testril's provenance supplied a standard source trail that let us reconstruct its answer independently from Ethereum. We have included the data and the software so readers can repeat that reconstruction.

Disclose our relationship to Testril near the beginning. This is an account of specific results, not a claim that Testril cannot have bugs or that every Nansen service is wrong.

## 1. Open with the problem anyone can understand

Suggested introduction:

> We were building a demo to compare Nansen and Testril pricing. First, we needed to make sure they agreed about what had happened. We asked who had sent and received USDC during two separate hours. One Nansen service gave us exactly the same answer for both hours. Testril gave us two different answers.
>
> A disagreement leaves you with a more important question: which answer should you believe? We build Testril, so asking readers to take our word for it would settle very little. Instead, we followed its source trail back to Ethereum, collected the original records, and repeated the calculation. This post includes the code and the evidence. You can check our work yourself.

Keep the opening about checking an answer. Introduce “provenance” afterward as the record of where an answer came from and how it was produced.

## 2. State the question and the scope

The question was:

**“Who did this address send USDC to and receive USDC from during this hour, and how much moved?”**

We checked one Ethereum address, the Uniswap V3 USDC/WETH trading pool:

```text
Address: 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640
USDC:    0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
Date:    10 November 2026
Hours:   12:00–13:00 and 13:00–14:00 UTC
```

It is a contract address, not our personal wallet. Each hour includes its start and excludes its end.

Describe these as **the same question and scope**, rather than “identical endpoints.” We used Nansen's counterparty summary and Testril's wallet transfers, grouped by the other address. They expose different interfaces. The independently reconstructed transfer records let us check the summary question directly.

Testril supplied the transfers; grouping them by the other address was our demo's calculation. The independent verifier repeats that grouping from Ethereum's records too.

## 3. Show the discrepancy

The requests to Nansen's [Address Counterparties service](https://docs.nansen.ai/api/profiler/address-counterparties) used this form, changing only the hour:

```http
POST https://api.nansen.ai/api/v1/profiler/address/counterparties
Content-Type: application/json
```

```json
{
  "address": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "chain": "ethereum",
  "date": {
    "from": "2026-11-10T12:00:00Z",
    "to": "2026-11-10T13:00:00Z"
  },
  "source_input": "Tokens",
  "group_by": "wallet",
  "pagination": { "page": 1, "per_page": 1000 }
}
```

The second request used 13:00 and 14:00. The documentation accepts timestamps. Both complete responses contained the same 910 entries, including the same counts and amounts; both reported that no further page remained. Of those entries, 787 involved USDC.

| USDC transfer count | Testril | Nansen counterparty summary |
| ------------------- | ------- | --------------------------- |
| 12:00–13:00         | 292     | 7,139                       |
| 13:00–14:00         | 503     | 7,139                       |

The Nansen count is the sum of USDC's `num_transfer` fields, not the number of response entries or a count across every token. We also compared incoming and outgoing amounts. Neither Nansen summary matches either Testril hour, even if the hours are swapped.

Do not claim to know the cause. Ignored time bounds or reuse of an answer for a wider period could explain it. We have not established what period the repeated answer represents.

## 4. Explain the distinction between investigation and provenance

We could investigate Nansen because we knew it had a separate [transaction-history service](https://docs.nansen.ai/api/profiler/address-transactions). We knew how to retrieve every page, select USDC, separate the transfer legs within transactions, preserve repeated transfers, and reconstruct the comparison.

That separate listing agreed with Testril: 292 transfers in the first hour, 503 in the second, with matching amounts, senders and recipients. Be explicit about that fact. It narrows the discrepancy to the counterparty summary for these requests.

The point is **not that Nansen's work is impossible to check**. We checked it by bringing our own understanding of how its separate products fit together. The counterparty response itself did not supply the source references and calculation identity needed to reproduce its reported summary.

Testril's approach makes that verification path part of its data contract. Together with the original request, provenance identifies the computation and its sources. Where a result depends on another calculation, the source trail can lead to those inputs. A reader follows those references instead of guessing which other service might explain an answer.

This is the broader value: a standard way to investigate data, rather than a successful investigation that depends on specialist product knowledge. Different computations still require the appropriate checking logic; the script below handles wallet transfers, not every Testril function.

## 5. Show the provenance we actually received

For each hour, we retrieved Testril's separate `provenance` report for the same bound function and window. Selected fields for the first hour were:

```json
{
  "bound_function_id": "sha256:76b099073c3bc3db28e5f8d1006a901ad4c64b3543bbaaab0b237621fe87dac1",
  "chain_id": 1,
  "from_block": 26384371,
  "to_block": 26384670,
  "block_count": 172,
  "computation": {
    "id": "erc20.wallet_transfers",
    "kind": "function",
    "version": 1
  },
  "digest": "sha256:337ea630fb5e9f6455a1be907fc6e9af299189292bde4bec240942dd3817b8fd"
}
```

The full report also lists every contributing block's number and hash. The second hour cites 200 contributing blocks and digest:

```text
sha256:32cc71c8a01d278d173a1ca7ca021a13d4018757608f83f65fef8c22ba0c07d9
```

Explain each element:

- The original request identifies the address and token we asked about.
- The bound-function identity connects the saved result and provenance to the same query instance.
- The computation name and version tell us which definition to examine. They are not executable source code by themselves.
- The block range fixes which part of Ethereum history is relevant.
- Each block hash identifies the cited block; the digest fingerprints the complete contributing block list.

The digest is SHA-256 over these lines in ascending block order, with lowercase hashes and a newline after each line:

```text
<chain_id>:<block_number>:<0x_block_hash>\n
```

A matching fingerprint checks the source list. Checking the numbers also requires retrieving the events and repeating the calculation.

## 6. Reconstruct the answer without either data provider

The JavaScript in Appendix A uses Node.js 22.13 or later, with no third-party packages. After loading the saved inputs, it talks only to an external Ethereum service. It does not ask Testril or Nansen whether their answers are right.

Walk the reader through its work:

1. Check the network, USDC's six decimal places, the computation identity, query range and provenance digest.
2. Retrieve every block header in the requested range, plus the neighboring headers needed to check time boundaries. Check that the headers link together, the cited block hashes agree, and the requested window is older than the node's finalized head.
3. Search the **entire** block range for USDC `Transfer` events naming the address as sender or recipient. Decode the sender, recipient and raw integer amount according to the [ERC-20 standard](https://eips.ethereum.org/EIPS/eip-20#transfer-1). Use [Ethereum's standard JSON-RPC methods](https://ethereum.org/en/developers/docs/apis/json-rpc/).
4. Keep distinct events within the same transaction. Count a self-transfer once as an event, while including its amount in both directions. Use `BigInt` for amounts so a one-unit difference cannot disappear through rounding.
5. Rebuild the contributing block list from Ethereum's events and recompute its digest. Compare every reconstructed transfer with Testril's row, including block, log index, transaction, token, sender, recipient and exact amount.
6. Calculate incoming/outgoing totals and group the independently reconstructed events by the other address. Those groups answer the original counterparty question.

Explain the omission check carefully. Each hour spans **299 blocks**, although only 172 or 200 contain relevant transfers. Checking only the blocks a provider cites could miss an event in an uncited block. Searching all **598 blocks** across the two hours checks that possibility against the external node's records.

## 7. Publish the actual result

The full live reconstruction passed using `rpc.mevblocker.io`. We archived the Ethereum responses, including the header fields used by the verifier. Both independently reconstructed source fingerprints match the provenance reports.

| Result reconstructed from Ethereum                 | 12:00–13:00      | 13:00–14:00       |
| -------------------------------------------------- | ---------------- | ----------------- |
| USDC transfers                                     | 292              | 503               |
| Incoming USDC                                      | 2,626,205.204677 | 10,682,099.941951 |
| Outgoing USDC                                      | 2,069,464.783424 | 14,470,892.270815 |
| Other addresses                                    | 93               | 158               |
| Every Testril transfer row matches                 | Yes              | Yes               |
| Every published Testril counterparty total matches | Yes              | Yes               |

That is **795 verified transfers and 251 per-hour counterparty totals**. The 251 figure adds the two hours' group counts; it is not a claim of 251 distinct addresses across both hours.

For a concrete example, the independent calculation confirmed these numbers for `0x51c72848c68a965f66fa7a88855f9f7784502a7f`:

| USDC metric | Ethereum reconstruction, 12:00–13:00 | Ethereum reconstruction, 13:00–14:00 | Nansen counterparty summary, either hour |
| ----------- | ------------------------------------ | ------------------------------------ | ---------------------------------------- |
| Transfers   | 34                                   | 49                                   | 841                                      |
| Incoming    | 1,020,320.767107                     | 2,458,599.369898                     | 39,091,190.417167                        |
| Outgoing    | 327,701.521529                       | 4,978,945.772832                     | 35,494,186.415681                        |

Include the two provenance digests beside the result table or in a technical note. The saved output is in [the verification materials](../research/why-provenance-matters/README.md).

## 8. Check that the checker can fail

Ten automated tests pass. They reconstruct the saved results and deliberately introduce errors:

- Change a transfer by one raw unit; remove a transfer; substitute a duplicate.
- Change a cited block hash and recompute the accompanying digest.
- Remove a contributing block from the citations and recompute the digest.
- Change the requested hour or omit an event from the source response.
- Exercise self-transfers, integers larger than JavaScript's ordinary precise-number range, and failed, incomplete or reordered Ethereum responses.

These are local tests using recorded Ethereum responses and a temporary test server. The live reconstruction is separate evidence. Passing a test suite alone would not establish that the production figures match Ethereum.

## 9. Say exactly what we have proved

We independently reproduced the returned transfers and the published counterparty calculations for this address, token and two historical hours. The conclusion now rests on reconstructing the source records, not just on two vendors agreeing or on a handful of sampled transactions.

Keep these technical limits explicit:

- We trust the external Ethereum service to return correct canonical headers and complete event records. Readers can repeat the check against their own node. The script does not validate Ethereum consensus or construct and verify transaction-receipt proofs against an independently trusted chain head.
- A fingerprint does not prove arithmetic correct; that is why the script reconstructs the events, rows and totals.
- The provenance was retrieved separately after the original reads. These files are not a vendor-signed attestation authenticating the original delivery. We verified their contents against Ethereum.
- This verifies one named computation on two windows. Other computations need their own appropriate checking logic, following the provenance and any dependencies.
- The Nansen summary's cause remains unknown. Its separate transaction-history service agrees with the verified records. Do not expand this finding into a claim that all Nansen data is wrong.

## 10. Close in plain English

Suggested conclusion:

> Mistakes in data will happen. When they do, the answer should come with enough information for someone else to investigate it.
>
> We could investigate Nansen because we already knew how to connect its separate services. With Testril, the source trail gave us a defined path back to the records behind the answer. We followed that path, repeated the calculation, and confirmed the numbers. The files and code are here so you can repeat it too.
>
> Provenance makes “show your work” something a reader can actually use.

## Appendix A: complete verification program

The code below is the runnable `verify.mjs` from the accompanying materials. It reads `input.json`, the saved rows and provenance, and writes an evidence archive containing its Ethereum requests, relevant responses, reconstructed results and every counterparty total.

From the companion directory:

```bash
ETHEREUM_RPC_URL=https://rpc.mevblocker.io \
  node verify.mjs input.json my-verification.json

node --test verify.test.mjs
shasum -a 256 -c SHA256SUMS
```

Choose a new output filename for each live run. The supplied Ethereum service must support the required historical methods and batch requests; a refused or incomplete response stops verification. The recorded evidence is supplied so a reader can inspect the successful run even if a public service later changes its access rules.

The complete code follows. The companion files include the saved inputs, full recorded verification evidence, complete normalized comparison data and the tests. No special knowledge of Nansen's other services is needed to run this Testril check.

```javascript
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hex = (number) => `0x${number.toString(16)}`;
const identity = (row) => `${row.tx}:${row.log_index}`;
const rowKey = (r) =>
  [r.block, r.log_index, r.tx, r.token, r.from, r.to, r.value].join(":");

export function digest(chain, blocks) {
  const text = blocks
    .map((b) => `${chain}:${b.number}:${b.block_hash}\n`)
    .join("");
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export function rpcClient(url, archive) {
  let nextId = 0;
  return async (calls) => {
    const requests = calls.map((c) => ({ ...c, jsonrpc: "2.0", id: nextId++ }));
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    check(
      response.ok,
      `Ethereum service returned HTTP ${response.status} for ${calls.length} calls (${calls[0].method})`,
    );
    const replies = await response.json();
    check(Array.isArray(replies), "Expected an Ethereum batch response");
    // Keep the header fields used below; omit unrelated transaction lists.
    archive.push({
      requests,
      replies: replies.map((reply) => {
        const request = requests.find((r) => r.id === reply.id);
        const b = reply.result;
        return request?.method === "eth_getBlockByNumber" && b
          ? {
              ...reply,
              result: {
                number: b.number,
                hash: b.hash,
                parentHash: b.parentHash,
                timestamp: b.timestamp,
              },
            }
          : reply;
      }),
    });
    check(replies.length === requests.length, "Incomplete Ethereum response");
    const byId = new Map(replies.map((r) => [r.id, r]));
    check(byId.size === replies.length, "Duplicate Ethereum response IDs");
    return requests.map((r) => {
      const reply = byId.get(r.id);
      check(reply && !reply.error, `${r.method} failed; verification stopped`);
      check(reply.result !== undefined, `${r.method} returned no result`);
      return reply.result;
    });
  };
}

export async function verifyWindow(input, rpc) {
  const { scope, provenance: p, rows: expected } = input;
  const { from_block: from, to_block: to, wallet, token } = scope;
  check(scope.chain_id === 1 && scope.decimals === 6, "Expected Ethereum USDC");
  check(
    Number.isSafeInteger(from) &&
      Number.isSafeInteger(to) &&
      from > 0 &&
      to > from &&
      to - from <= 10000,
    "Bad range",
  );
  check(p.outcome === "success" && !p.orphaned?.length, "Unusable provenance");
  check(
    p.chain_id === scope.chain_id &&
      p.bound_function_id === scope.bound_function_id &&
      p.from_block === from &&
      p.to_block === to,
    "Provenance identifies a different query",
  );
  check(
    p.computation?.id === "erc20.wallet_transfers" &&
      p.computation.version === 1,
    "Unexpected computation",
  );
  check(p.block_count === p.blocks.length, "Incorrect cited block count");
  const cited = new Map();
  for (const b of p.blocks) {
    check(
      b.number >= from && b.number < to,
      "Citation outside requested range",
    );
    check(!cited.has(b.number), "Duplicate cited block");
    cited.set(b.number, b.block_hash);
  }
  const ordered = [...p.blocks].sort((a, b) => a.number - b.number);
  check(
    digest(scope.chain_id, ordered) === p.digest,
    "Provenance digest mismatch",
  );

  const [chain, decimals, finalized] = await rpc([
    { method: "eth_chainId", params: [] },
    {
      method: "eth_call",
      params: [{ to: token, data: "0x313ce567" }, "latest"],
    },
    { method: "eth_getBlockByNumber", params: ["finalized", false] },
  ]);
  check(Number(BigInt(chain)) === scope.chain_id, "Wrong Ethereum network");
  check(Number(BigInt(decimals)) === scope.decimals, "Wrong token decimals");
  check(
    finalized && Number(BigInt(finalized.number)) >= to,
    "Window not finalized",
  );

  // Include uncited blocks: citations alone cannot reveal an omitted transfer.
  const headers = new Map();
  for (let start = from - 1; start <= to; start += 40) {
    const numbers = Array.from(
      { length: Math.min(40, to - start + 1) },
      (_, i) => start + i,
    );
    const batch = await rpc(
      numbers.map((n) => ({
        method: "eth_getBlockByNumber",
        params: [hex(n), false],
      })),
    );
    batch.forEach((b, i) => {
      check(b && Number(BigInt(b.number)) === numbers[i], "Wrong block header");
      headers.set(numbers[i], b);
    });
  }
  for (let n = from; n <= to; n++) {
    check(
      headers.get(n).parentHash === headers.get(n - 1).hash,
      "Broken block chain",
    );
  }
  for (const [n, hash] of cited) {
    check(
      headers.get(n).hash === hash,
      "Cited block hash differs from Ethereum",
    );
  }
  for (const [n, time] of [
    [from, scope.from_time],
    [to, scope.to_time],
  ]) {
    const seconds = Date.parse(time) / 1000;
    check(Number.isFinite(seconds), "Invalid time bound");
    check(
      Number(BigInt(headers.get(n - 1).timestamp)) < seconds &&
        Number(BigInt(headers.get(n).timestamp)) >= seconds,
      "Blocks do not match the requested hour",
    );
  }

  const topic = `0x${wallet.slice(2).padStart(64, "0")}`;
  const actual = new Map();
  for (const topics of [
    [transferTopic, topic],
    [transferTopic, null, topic],
  ]) {
    const [logs] = await rpc([
      {
        method: "eth_getLogs",
        params: [
          {
            address: token,
            fromBlock: hex(from),
            toBlock: hex(to - 1),
            topics,
          },
        ],
      },
    ]);
    check(Array.isArray(logs), "Missing Ethereum logs");
    const seen = new Set();
    for (const log of logs) {
      check(
        !log.removed && log.address.toLowerCase() === token,
        "Wrong source log",
      );
      check(
        log.topics.length === 3 &&
          log.topics[0] === transferTopic &&
          /^0x[0-9a-fA-F]{64}$/.test(log.data),
        "Malformed Transfer event",
      );
      const row = {
        block: Number(BigInt(log.blockNumber)),
        log_index: BigInt(log.logIndex).toString(),
        tx: log.transactionHash.toLowerCase(),
        token,
        from: `0x${log.topics[1].slice(-40)}`.toLowerCase(),
        to: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        value: BigInt(log.data).toString(),
      };
      check(
        row.block >= from && row.block < to,
        "Event outside requested range",
      );
      check(row.from === wallet || row.to === wallet, "Unrelated transfer");
      check(
        log.blockHash === headers.get(row.block).hash,
        "Event on wrong block",
      );
      const id = identity(row),
        previous = actual.get(id);
      check(!seen.has(id), "Duplicate event in one Ethereum response");
      seen.add(id);
      if (previous) {
        check(
          row.from === wallet && row.to === wallet,
          "Unexpected duplicate event",
        );
        check(rowKey(previous) === rowKey(row), "Conflicting self-transfer");
      }
      actual.set(id, row);
    }
  }
  const contributing = [...new Set([...actual.values()].map((r) => r.block))]
    .sort((a, b) => a - b)
    .map((number) => ({ number, block_hash: headers.get(number).hash }));
  check(
    digest(scope.chain_id, contributing) === p.digest,
    "Contributing blocks differ",
  );
  check(actual.size === expected.length, "Transfer count differs from Testril");
  const claimed = new Set();
  for (const row of expected) {
    const id = identity(row);
    check(!claimed.has(id), "Duplicate Testril event");
    claimed.add(id);
    check(
      actual.has(id) && rowKey(actual.get(id)) === rowKey(row),
      "Transfer differs from Testril",
    );
  }
  let incoming = 0n,
    outgoing = 0n;
  const partners = new Map();
  for (const r of actual.values()) {
    if (r.to === wallet) incoming += BigInt(r.value);
    if (r.from === wallet) outgoing += BigInt(r.value);
    const address = r.from === wallet ? r.to : r.from;
    const total = partners.get(address) ?? {
      transfers: 0,
      incoming: 0n,
      outgoing: 0n,
    };
    total.transfers++;
    if (r.to === wallet) total.incoming += BigInt(r.value);
    if (r.from === wallet) total.outgoing += BigInt(r.value);
    partners.set(address, total);
  }
  return {
    from_time: scope.from_time,
    to_time: scope.to_time,
    transfers: actual.size,
    contributing_blocks: contributing.length,
    incoming_atoms: incoming.toString(),
    outgoing_atoms: outgoing.toString(),
    provenance_digest: p.digest,
    exact_match: true,
    counterparties: [...partners]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([address, r]) => ({
        address,
        transfers: r.transfers,
        incoming_atoms: r.incoming.toString(),
        outgoing_atoms: r.outgoing.toString(),
      })),
  };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  check(
    inputPath && outputPath && process.env.ETHEREUM_RPC_URL,
    "Usage: ETHEREUM_RPC_URL=https://... node verify.mjs input.json evidence.json",
  );
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const batches = [],
    rpc = rpcClient(process.env.ETHEREUM_RPC_URL, batches);
  const results = [];
  for (const window of input.windows) {
    const load = (path) => readFile(resolve(dirname(inputPath), path), "utf8");
    results.push(
      await verifyWindow(
        {
          scope: { ...input, ...window },
          provenance: JSON.parse(await load(window.provenance)),
          rows: (await load(window.rows))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        },
        rpc,
      ),
    );
  }
  const report = {
    checked_at: new Date().toISOString(),
    rpc_host: new URL(process.env.ETHEREUM_RPC_URL).hostname,
    results,
  };
  await writeFile(outputPath, JSON.stringify({ ...report, batches }) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify(
      {
        ...report,
        results: results.map(({ counterparties, ...r }) => ({
          ...r,
          counterparties: counterparties.length,
        })),
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```
