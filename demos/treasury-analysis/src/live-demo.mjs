import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { demoLimitRaw, sameAddress } from "./live-config.mjs";
import { createLiveTestril } from "./live-testril.mjs";
import { parseUsdc } from "../public/amounts.js";
import { replayBalances } from "../public/replay.js";

export async function createLiveDemo({ config, chain, mcp, directory }) {
  const lock = join(directory, ".live-lock");
  try {
    await mkdir(lock);
  } catch {
    throw new Error(
      "Another live server holds .live-lock. Stop it before starting live mode.",
    );
  }
  const path = join(directory, ".live-state.json");
  const identity = JSON.stringify({
    chain: config.chain,
    token: config.token,
    wallets: config.wallets,
    payer: config.payer.address,
    mcp: config.mcpUrl,
  });
  let state;
  let queue = Promise.resolve();
  const save = async () => {
    await writeFile(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(`${path}.tmp`, path);
  };
  const serial = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  try {
    try {
      state = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (state && state.identity !== identity)
      throw new Error(
        "The saved live session belongs to a different wallet, token, or MCP configuration.",
      );
    if (!state) {
      const snapshot = await chain.snapshot();
      if (BigInt(snapshot.balances.treasury) < BigInt(demoLimitRaw))
        throw new Error("Treasury needs at least 1 test USDC.");
      state = {
        identity,
        id: randomUUID(),
        revision: 0,
        cycle: 1,
        chargeCapRaw: config.chargeCapRaw,
        depositCapRaw: config.depositCapRaw,
        depositedRaw: "0",
        initialBalances: { treasury: demoLimitRaw, a: "0", b: "0" },
        reserves: {
          ...snapshot.balances,
          treasury: (
            BigInt(snapshot.balances.treasury) - BigInt(demoLimitRaw)
          ).toString(),
        },
        balances: { treasury: demoLimitRaw, a: "0", b: "0" },
        actualBalances: snapshot.balances,
        snapshot,
        transfers: [],
        receipts: [],
        startIndex: 0,
        pending: null,
        lastReset: null,
        functions: {},
        balanceEvidence: {},
        transferEvidence: {},
        refreshNeeded: true,
      };
      await save();
    }
    // Caps belong to the saved session. Restarting or reset cannot refill them.
    if (BigInt(config.chargeCapRaw) < BigInt(state.chargeCapRaw))
      state.chargeCapRaw = config.chargeCapRaw;
    if (BigInt(config.depositCapRaw) < BigInt(state.depositCapRaw))
      state.depositCapRaw = config.depositCapRaw;
    const testril = createLiveTestril(config, mcp, state, save);
    const current = () => state.transfers.slice(state.startIndex);
    const wallet = (id) => config.wallets.find((w) => w.id === id);
    function publicState() {
      const spent = state.receipts.reduce(
        (sum, r) => sum + BigInt(r.chargeRaw),
        0n,
      );
      return {
        mode: "live",
        id: state.id,
        revision: state.revision,
        cycle: state.cycle,
        chain: config.chain,
        token: config.token,
        wallets: config.wallets,
        initialBalances: state.initialBalances,
        balances: state.balances,
        actualBalances: state.actualBalances,
        transferCount: current().length,
        balanceRead: {
          ...state.snapshot,
          balances: state.balances,
          function: "erc20.token_balance",
        },
        historyRead: { transfers: current() },
        lastReset: state.lastReset,
        refreshNeeded: state.refreshNeeded,
        pending: state.pending ? { hash: state.pending.hash } : null,
        payment: {
          address: config.payer.address,
          initialRaw: state.chargeCapRaw,
          remainingRaw: (spent < BigInt(state.chargeCapRaw)
            ? BigInt(state.chargeCapRaw) - spent
            : 0n
          ).toString(),
          spentRaw: spent.toString(),
          requestCount: state.receipts.reduce(
            (sum, r) => sum + r.requestCount,
            0,
          ),
          depositedRaw: state.depositedRaw,
          depositCapRaw: state.depositCapRaw,
        },
        receipts: state.receipts.map(
          ({
            mode,
            id,
            kind,
            function: fn,
            status,
            chargeRaw,
            depositRaw,
            lines,
            requestCount,
            block,
            timestamp,
          }) => ({
            mode,
            id,
            kind,
            function: fn,
            status,
            chargeRaw,
            depositRaw,
            lines,
            requestCount,
            block,
            timestamp,
          }),
        ),
      };
    }
    async function recoverTransfer() {
      if (!state.pending) return;
      await chain.broadcast(state.pending);
      const transfer = await chain.confirm(state.pending);
      if (!transfer.reverted) {
        state.transfers.push(transfer);
        state.balances = replayBalances(
          state.initialBalances,
          current(),
          current().length,
        );
      }
      state.pending = null;
      state.refreshNeeded = true;
      state.revision += 1;
      await save();
      if (transfer.reverted)
        throw new Error(
          "The transfer reverted. No USDC moved; gas may have been spent.",
        );
    }
    async function refresh() {
      state.refreshNeeded = true;
      await save();
      await recoverTransfer();
      if (!state.functions.edges) {
        state.functions.edges = await testril.bind("erc20.transfer_edges", {
          token_address: config.token.address,
        });
        for (const w of config.wallets)
          state.functions[w.id] = await testril.bind("erc20.token_balance", {
            tokens: [config.token.address],
            owners: [w.address],
          });
        await save();
      }
      // Freeze one snapshot so retries reuse paid reads instead of charging new blocks.
      state.refreshBlock ??= (await chain.snapshot()).block;
      await save();
      const snapshot = await chain.snapshot(state.refreshBlock);
      const actual = {};
      for (const w of config.wallets) {
        const rows = await testril.read(state.functions[w.id], snapshot.block);
        if (
          !Array.isArray(rows) ||
          rows.length > 1 ||
          rows.some(
            (r) =>
              r.block !== snapshot.block ||
              !sameAddress(r.token, config.token.address),
          )
        )
          throw new Error("Testril returned an unexpected balance snapshot.");
        actual[w.id] = rows[0]?.balance ?? "0";
        if (actual[w.id] !== snapshot.balances[w.id])
          throw new Error(
            "Testril and the reference RPC disagree on a balance.",
          );
        if (
          BigInt(actual[w.id]) - BigInt(state.reserves[w.id]) !==
          BigInt(state.balances[w.id])
        )
          throw new Error(
            "A wallet changed outside this demo. Live transfers are paused to protect the 1 USDC allowance.",
          );
        state.balanceEvidence[w.id] = {
          source: {
            wallet: w.name,
            address: w.address,
            balanceRaw: actual[w.id],
            demoBalanceRaw: state.balances[w.id],
            block: snapshot.block,
            blockHash: snapshot.blockHash,
            timestamp: snapshot.timestamp,
          },
          citation: await testril.provenance(
            state.functions[w.id],
            snapshot.block,
          ),
        };
      }
      for (const transfer of current()) {
        if (state.transferEvidence[transfer.id]) continue;
        const rows = await testril.read(state.functions.edges, transfer.block);
        const edge = rows.find(
          (r) =>
            r.block === transfer.block &&
            sameAddress(r.from, wallet(transfer.from).address) &&
            sameAddress(r.to, wallet(transfer.to).address),
        );
        if (
          !edge ||
          BigInt(edge.amount) < BigInt(transfer.amountRaw) ||
          BigInt(edge.count) < 1n
        )
          throw new Error(
            "Testril does not include the confirmed transfer in its block's edge result.",
          );
        state.transferEvidence[transfer.id] = {
          edge,
          citation: await testril.provenance(
            state.functions.edges,
            transfer.block,
          ),
        };
      }
      state.snapshot = snapshot;
      state.actualBalances = actual;
      state.refreshNeeded = false;
      delete state.refreshBlock;
      state.revision += 1;
      await save();
      return publicState();
    }
    async function send(from, to, amountRaw, kind = "transfer") {
      if (!wallet(from) || !wallet(to) || from === to)
        throw new Error("Choose two different demo wallets.");
      const amount = BigInt(amountRaw);
      if (amount <= 0n || amount > BigInt(state.balances[from]))
        throw new Error(
          "This transfer exceeds the sending wallet's share of the 1 USDC demo allowance.",
        );
      if (state.pending)
        throw new Error("A transfer is pending. Refresh before sending again.");
      const latest = await chain.snapshot();
      for (const w of config.wallets)
        if (
          BigInt(latest.balances[w.id]) - BigInt(state.reserves[w.id]) !==
          BigInt(state.balances[w.id])
        )
          throw new Error(
            "A wallet changed outside this demo. Refresh before sending.",
          );
      const prepared = await chain.prepare(from, to, amountRaw);
      state.pending = { ...prepared, from, to, amountRaw, kind };
      state.refreshNeeded = true;
      state.revision += 1;
      await save();
      await recoverTransfer();
    }
    return {
      id: state.id,
      state: publicState,
      refresh: () => serial(refresh),
      transfer: (input) =>
        serial(async () => {
          if (input.revision !== state.revision) throw stale(publicState());
          if (state.refreshNeeded)
            throw new Error(
              "Refresh live reads before sending another transfer.",
            );
          await send(input.from, input.to, parseUsdc(input.amount));
          return refresh();
        }),
      reset: (input) =>
        serial(async () => {
          if (input.revision !== state.revision) throw stale(publicState());
          await recoverTransfer();
          const sweeps = [];
          for (const w of config.wallets.filter((w) => w.id !== "treasury")) {
            const amount = state.balances[w.id];
            if (amount === "0") continue;
            await send(w.id, "treasury", amount, "reset");
            sweeps.push(state.transfers.at(-1));
          }
          state.startIndex = state.transfers.length;
          state.cycle += 1;
          state.lastReset = {
            mode: "live",
            sweeps,
            returnedRaw: sweeps
              .reduce((sum, t) => sum + BigInt(t.amountRaw), 0n)
              .toString(),
          };
          state.refreshNeeded = true;
          delete state.refreshBlock;
          await save();
          return refresh();
        }),
      provenance(id) {
        const transfer = current().find((t) => t.id === id);
        const evidence = state.transferEvidence[id];
        if (!transfer || !evidence)
          throw new Error(
            "Refresh live reads to obtain this transfer's evidence.",
          );
        return {
          mode: "live",
          chain: config.chain,
          token: config.token,
          function: {
            name: "erc20.transfer_edges",
            version: evidence.citation.computation.version,
          },
          range: { fromBlock: transfer.block, toBlock: transfer.block + 1 },
          source: {
            ...transfer,
            from: wallet(transfer.from).address,
            to: wallet(transfer.to).address,
          },
          calculation: {
            description:
              "Transaction evidence comes from the RPC receipt. Testril returns the block's aggregate for this sender/recipient pair.",
          },
          ...evidence,
          note: "The RPC receipt identifies this transaction. The MCP citation identifies the computation and contributing blocks; it is not transaction-level lineage.",
        };
      },
      balanceProvenance(id) {
        const evidence = state.balanceEvidence[id];
        if (!evidence)
          throw new Error(
            "Refresh live reads to obtain this balance's evidence.",
          );
        return {
          mode: "live",
          chain: config.chain,
          token: config.token,
          function: {
            name: "erc20.token_balance",
            version: evidence.citation.computation.version,
          },
          ...evidence,
          calculation: {
            description:
              "The full wallet balance is read at this block and compared with the reference RPC. Demo balances subtract the funds reserved outside the 1 USDC allowance.",
          },
          note: "This is the actual onchain wallet balance; the interface shows the wallet's share of the 1 USDC demo allowance.",
        };
      },
      export() {
        return {
          formatVersion: 2,
          ...publicState(),
          transfers: current(),
          note: "Live Base Sepolia run. Demo balances track a 1 USDC allowance. RPC receipts and Testril block citations are separate evidence sources.",
          balanceProvenance: config.wallets.map(
            (w) => state.balanceEvidence[w.id] ?? null,
          ),
          provenance: current().map(
            (t) => state.transferEvidence[t.id] ?? null,
          ),
        };
      },
      async close() {
        await queue;
        await mcp.close();
        await rm(lock, { recursive: true });
      },
    };
  } catch (error) {
    await rm(lock, { recursive: true });
    await mcp.close();
    throw error;
  }
}

function stale(state) {
  const error = new Error(
    "This view is out of date. Try again with the latest demo balances.",
  );
  error.status = 409;
  error.state = state;
  return error;
}
