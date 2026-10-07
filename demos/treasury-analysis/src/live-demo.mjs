import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sameAddress } from "./live-config.mjs";
import { createLiveTestril } from "./live-testril.mjs";
import { createTransferTiming } from "./transfer-timing.mjs";
import { parseUsdc } from "../public/amounts.js";

export async function createLiveDemo({ config, chain, mcp, directory }) {
  const lock = join(directory, ".live-lock");
  try {
    await mkdir(lock);
  } catch (error) {
    await mcp.close();
    if (error.code !== "EEXIST") throw error;
    let owner;
    try {
      owner = Number(await readFile(join(lock, "pid"), "utf8"));
    } catch {
      // Older lock directories did not record an owner.
    }
    if (Number.isSafeInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0);
      } catch (error) {
        if (error.code === "ESRCH")
          throw new Error(
            `Previous live server (PID ${owner}) has stopped. Remove the stale .live-lock directory and retry; keep .live-state.json.`,
          );
      }
      throw new Error(
        `Live server PID ${owner} holds .live-lock. Stop that server before starting live mode.`,
      );
    }
    throw new Error(
      "The .live-lock directory has no owner record. After checking that all demo servers have stopped, remove only .live-lock and retry; keep .live-state.json.",
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
  let closing;
  let timing;
  const measure = (name, operation) =>
    timing ? timing.measure(name, operation) : operation();
  const stage = (name, operation) =>
    timing ? timing.stage(name, operation) : operation();
  let saves = Promise.resolve();
  const save = () => {
    const contents = `${JSON.stringify(state, null, 2)}\n`;
    const result = measure("Save session", () =>
      saves.then(async () => {
        await writeFile(`${path}.tmp`, contents, { mode: 0o600 });
        await rename(`${path}.tmp`, path);
      }),
    );
    saves = result.catch(() => {});
    return result;
  };
  const serial = (operation) => {
    if (closing)
      return Promise.reject(new Error("The live server is shutting down."));
    const result = queue.then(() => operation());
    queue = result.catch(() => {});
    return result;
  };
  try {
    await writeFile(join(lock, "pid"), `${process.pid}\n`, { mode: 0o600 });
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
      state = {
        identity,
        id: randomUUID(),
        revision: 0,
        cycle: 1,
        chargeCapRaw: config.chargeCapRaw,
        depositCapRaw: config.depositCapRaw,
        depositedRaw: "0",
        initialBalances: null,
        balances: Object.fromEntries(config.wallets.map((w) => [w.id, null])),
        transfers: [],
        receipts: [],
        paymentStartIndex: 0,
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
    // Upgrade saved allowance sessions without losing payments or pending transfers.
    if (state.reserves) {
      for (const w of config.wallets) {
        state.initialBalances[w.id] = (
          BigInt(state.initialBalances[w.id]) + BigInt(state.reserves[w.id])
        ).toString();
        state.balances[w.id] = (
          BigInt(state.balances[w.id]) + BigInt(state.reserves[w.id])
        ).toString();
      }
      delete state.reserves;
      state.refreshNeeded = true;
      await save();
    }
    // Caps belong to the saved session. Restarting or reset cannot refill them.
    if (BigInt(config.chargeCapRaw) < BigInt(state.chargeCapRaw))
      state.chargeCapRaw = config.chargeCapRaw;
    if (BigInt(config.depositCapRaw) < BigInt(state.depositCapRaw))
      state.depositCapRaw = config.depositCapRaw;
    const timedMcp = {
      ...mcp,
      call(name, args = {}) {
        let label = `Testril ${name}`;
        if (name === "inspect") label += ` ${args.subject}`;
        if (["read", "materialize", "provenance"].includes(name)) {
          const bound =
            args.bound_function_id ??
            state.receipts.find((r) => r.paymentId === args.payment_id)
              ?.function;
          const wallet = config.wallets.find(
            (w) => state.functions[w.id] === bound,
          );
          label += ` ${wallet?.name ?? "transfer edges"}`;
          if (name !== "provenance")
            label += args.payment_id ? " execute" : " quote";
        }
        return measure(label, () => mcp.call(name, args));
      },
    };
    const testril = createLiveTestril(config, timedMcp, state, save, measure);
    const current = () => state.transfers.slice(state.startIndex);
    const wallet = (id) => config.wallets.find((w) => w.id === id);
    function paymentHistory(start = 0) {
      return state.receipts
        .slice(start)
        .map(
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
        );
    }
    function publicState() {
      const sources = Object.fromEntries(
        config.wallets.map((w) => [
          w.id,
          state.balanceEvidence[w.id]?.source ?? null,
        ]),
      );
      const actualBalances = Object.fromEntries(
        config.wallets.map((w) => [w.id, sources[w.id]?.balanceRaw ?? null]),
      );
      const lifetimeSpent = state.receipts.reduce(
        (sum, r) => sum + BigInt(r.chargeRaw),
        0n,
      );
      const receipts = paymentHistory(state.paymentStartIndex ?? 0);
      const spent = receipts.reduce((sum, r) => sum + BigInt(r.chargeRaw), 0n);
      return {
        mode: "live",
        mcpUrl: config.mcpUrl,
        id: state.id,
        revision: state.revision,
        cycle: state.cycle,
        chain: config.chain,
        token: config.token,
        wallets: config.wallets,
        initialBalances: state.initialBalances,
        balances: state.balances,
        actualBalances,
        transferCount: current().length,
        balanceRead: {
          balances: actualBalances,
          sources,
          function: "erc20.token_balance",
        },
        historyRead: { transfers: current() },
        lastReset: state.lastReset,
        refreshNeeded: state.refreshNeeded,
        pending: state.pending ? { hash: state.pending.hash } : null,
        payment: {
          address: config.payer.address,
          initialRaw: state.chargeCapRaw,
          remainingRaw: (lifetimeSpent < BigInt(state.chargeCapRaw)
            ? BigInt(state.chargeCapRaw) - lifetimeSpent
            : 0n
          ).toString(),
          spentRaw: spent.toString(),
          requestCount: receipts.reduce((sum, r) => sum + r.requestCount, 0),
          lifetimeSpentRaw: lifetimeSpent.toString(),
          lifetimeRequestCount: state.receipts.reduce(
            (sum, r) => sum + r.requestCount,
            0,
          ),
          depositedRaw: state.depositedRaw,
          depositCapRaw: state.depositCapRaw,
        },
        receipts,
      };
    }
    async function recoverTransfer() {
      if (!state.pending) return;
      await stage("RPC broadcast", () => chain.broadcast(state.pending));
      const transfer = await stage(
        "RPC receipt wait and block verification",
        () => chain.confirm(state.pending),
      );
      if (!transfer.reverted) {
        state.transfers.push(transfer);
      }
      state.pending = null;
      state.refreshNeeded = true;
      state.revision += 1;
      await save();
      if (transfer.reverted)
        throw new Error(
          "The transfer reverted. No USDC moved; gas may have been spent.",
        );
      return transfer;
    }
    async function refresh(confirmedBlock, involved) {
      state.refreshNeeded = true;
      await save();
      const recovered = await recoverTransfer();
      testril.beginReadBatch();
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
      state.refreshBlock ??=
        confirmedBlock ??
        recovered?.block ??
        (await testril.head(state.transfers.at(-1)?.block ?? 0));
      await save();
      const block = state.refreshBlock;
      const actual = { ...state.balances };
      const selected = involved
        ? config.wallets.filter((w) => involved.includes(w.id))
        : config.wallets;
      const work = selected.map(async (w) => {
        const rows = await testril.read(state.functions[w.id], block);
        if (
          !Array.isArray(rows) ||
          rows.length > 1 ||
          rows.some(
            (r) =>
              r.block !== block || !sameAddress(r.token, config.token.address),
          )
        )
          throw new Error("Testril returned an unexpected balance snapshot.");
        actual[w.id] = rows[0]?.balance ?? "0";
        if (
          typeof actual[w.id] !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(actual[w.id])
        )
          throw new Error("Testril returned an invalid raw USDC balance.");
        state.balanceEvidence[w.id] = {
          source: {
            wallet: w.name,
            address: w.address,
            balanceRaw: actual[w.id],
            block,
          },
          ...(state.balanceEvidence[w.id]?.source.block === block
            ? { citation: state.balanceEvidence[w.id].citation }
            : {}),
        };
        await save();
      });
      work.push(
        ...current()
          .filter((transfer) => !state.transferEvidence[transfer.id])
          .map(async (transfer) => {
            const rows = await testril.read(
              state.functions.edges,
              transfer.block,
            );
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
            };
            await save();
          }),
      );
      // Drain every paid pipeline before reporting a failure or allowing another action.
      const results = await Promise.allSettled(work);
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
      state.balances = { ...actual };
      state.initialBalances ??= { ...actual };
      state.refreshNeeded = false;
      delete state.refreshBlock;
      state.revision += 1;
      await save();
      return publicState();
    }
    function validateTransfer(from, to, amountRaw) {
      if (!wallet(from) || !wallet(to) || from === to)
        throw new Error("Choose two different demo wallets.");
      const amount = BigInt(amountRaw);
      if (amount <= 0n || amount > BigInt(state.balances[from]))
        throw new Error(
          "Enter a positive amount within the sending wallet's available USDC balance.",
        );
    }
    async function send(from, to, amountRaw, kind = "transfer") {
      validateTransfer(from, to, amountRaw);
      if (state.pending)
        throw new Error("A transfer is pending. Refresh before sending again.");
      const prepared = await stage(
        "RPC transaction preparation and signing",
        () => chain.prepare(from, to, amountRaw),
      );
      state.pending = { ...prepared, from, to, amountRaw, kind };
      state.refreshNeeded = true;
      state.revision += 1;
      await save();
      return recoverTransfer();
    }
    return {
      id: state.id,
      state: publicState,
      refresh: () => serial(refresh),
      transfer(input) {
        const report = createTransferTiming();
        return serial(async () => {
          report.startWork();
          timing = report;
          try {
            if (input.revision !== state.revision) throw stale(publicState());
            if (state.refreshNeeded)
              throw new Error(
                "Refresh live reads before sending another transfer.",
              );
            const amount = parseUsdc(input.amount);
            validateTransfer(input.from, input.to, amount);
            const transfer = await send(input.from, input.to, amount);
            const result = await stage("Testril refresh after transfer", () =>
              refresh(transfer.block, [input.from, input.to]),
            );
            return { ...result, timing: report.finish("success") };
          } catch (error) {
            error.timing = report.finish("failed");
            throw error;
          } finally {
            timing = undefined;
          }
        });
      },
      reset: (input) =>
        serial(async () => {
          if (input.revision !== state.revision) throw stale(publicState());
          if (state.receipts.some((r) => r.status === "paying"))
            throw new Error(
              "A payment has an uncertain result. Reconcile its quote before resetting.",
            );
          await refresh();
          const sweeps = current().filter((t) => t.kind === "reset");
          for (const w of config.wallets.filter((w) => w.id !== "treasury")) {
            const amount = state.balances[w.id];
            if (amount === "0") continue;
            await send(w.id, "treasury", amount, "reset");
            sweeps.push(state.transfers.at(-1));
          }
          state.startIndex = state.transfers.length;
          state.paymentStartIndex = state.receipts.length;
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
          await refresh();
          state.initialBalances = { ...state.balances };
          await save();
          return publicState();
        }),
      provenance: (id) =>
        serial(async () => {
          const transfer = current().find((t) => t.id === id);
          const evidence = state.transferEvidence[id];
          if (!transfer || !evidence)
            throw new Error(
              "Refresh live reads to obtain this transfer's evidence.",
            );
          if (!evidence.citation) {
            evidence.citation = await testril.provenance(
              state.functions.edges,
              transfer.block,
            );
            await save();
          }
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
        }),
      balanceProvenance: (id) =>
        serial(async () => {
          const evidence = state.balanceEvidence[id];
          if (!evidence)
            throw new Error(
              "Refresh live reads to obtain this balance's evidence.",
            );
          if (!evidence.citation) {
            evidence.citation = await testril.provenance(
              state.functions[id],
              evidence.source.block,
            );
            await save();
          }
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
                "The full wallet balance comes from Testril at the cited block.",
            },
            note: "The interface shows the full Testril balance at the cited block. All USDC in Treasury, A, and B is available to the demo.",
          };
        }),
      export() {
        return {
          formatVersion: 3,
          ...publicState(),
          transfers: current(),
          allReceipts: paymentHistory(),
          note: "Live Base Sepolia run. receipts and payment.spentRaw cover this run; allReceipts and lifetime payment totals cover the saved session. balances and actualBalances contain the latest Testril wallet reads. initialBalances records the starting snapshot; outside wallet changes can alter the total funds. RPC receipts and Testril block citations are separate evidence sources.",
          balanceProvenance: config.wallets.map(
            (w) => state.balanceEvidence[w.id] ?? null,
          ),
          provenance: current().map(
            (t) => state.transferEvidence[t.id] ?? null,
          ),
        };
      },
      close() {
        closing ??= (async () => {
          await queue;
          try {
            await mcp.close();
          } finally {
            await rm(lock, { recursive: true });
          }
        })();
        return closing;
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
