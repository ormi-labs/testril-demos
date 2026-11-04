export const binds = [
  {
    name: "vitalik-domain",
    function_slug: "ens.domain",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      name: "vitalik.eth",
    },
    window: { from_block: 9380380, to_block: 26323365 },
  },
  {
    name: "vitalik-registration",
    function_slug: "ens.registration",
    chain_id: 1,
    params: {
      base_registrar: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
      label: "vitalik",
      controllers: [
        "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5",
        "0x253553366da8546fc250f225fe3d25d0c782303b",
        "0x59e16fccd424cc24e280be16e11bcd56fb0ce547",
      ],
    },
    window: { from_block: 9380380, to_block: 26323365 },
  },
  {
    name: "vitalik-address",
    function_slug: "ens.address_record",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      name: "vitalik.eth",
      by: "month",
    },
    window: { from_month: "2020-01", to_month: "2026-11" },
  },
  {
    name: "vitalik-wrapped",
    function_slug: "ens.wrapped_domain",
    chain_id: 1,
    params: {
      name_wrapper: "0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401",
      name: "vitalik.eth",
    },
    window: { from_block: 16925758, to_block: 26323365 },
  },
  {
    name: "nick-domain",
    function_slug: "ens.domain",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      name: "nick.eth",
    },
    window: { from_block: 9380380, to_block: 26323365 },
  },
  {
    name: "nick-registration",
    function_slug: "ens.registration",
    chain_id: 1,
    params: {
      base_registrar: "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85",
      label: "nick",
      controllers: [
        "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5",
        "0x253553366da8546fc250f225fe3d25d0c782303b",
        "0x59e16fccd424cc24e280be16e11bcd56fb0ce547",
      ],
    },
    window: { from_block: 9380380, to_block: 26323365 },
  },
  {
    name: "nick-address",
    function_slug: "ens.address_record",
    chain_id: 1,
    params: {
      registry: "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e",
      name: "nick.eth",
      by: "month",
    },
    window: { from_month: "2020-01", to_month: "2026-11" },
  },
  {
    name: "nick-wrapped",
    function_slug: "ens.wrapped_domain",
    chain_id: 1,
    params: {
      name_wrapper: "0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401",
      name: "nick.eth",
    },
    window: { from_block: 16925758, to_block: 26323365 },
  },
];
import {
  changes,
  formatDate,
  formatEth,
  kindLabels,
  shortAddress,
  timeline,
  zeroAddress,
} from "./timeline.mjs";

export { formatEth, zeroAddress };
export const nameWrapper = binds.find(
  (bind) => bind.function_slug === "ens.wrapped_domain",
).params.name_wrapper;

export const gracePeriodSeconds = 90 * 86400;
const basisPoints = 10000n;

const bindByName = Object.fromEntries(binds.map((b) => [b.name, b]));
export const windowOf = (bindName) => bindByName[bindName].window;

const bindKinds = {
  "ens.domain": "domain",
  "ens.registration": "registration",
  "ens.address_record": "address",
  "ens.wrapped_domain": "wrapped",
};
const bindsOfName = (name) =>
  Object.fromEntries(
    binds
      .filter(({ params }) => (params.name ?? `${params.label}.eth`) === name)
      .map((bind) => [bindKinds[bind.function_slug], bind.name]),
  );

export const subjects = binds
  .filter((bind) => bind.function_slug === "ens.domain")
  .map((bind) => {
    const binds = bindsOfName(bind.params.name);
    const missing = Object.values(bindKinds).filter((kind) => !binds[kind]);
    if (missing.length)
      throw new Error(
        `src/report.mjs: ${bind.params.name} has no ${missing.join(", ")} bind (matched by params.name, or params.label plus ".eth").`,
      );
    return { name: bind.params.name, binds };
  });

export const blockWindow = windowOf(subjects[0].binds.domain);
export const monthWindow = windowOf(subjects[0].binds.address);

const monthNumber = (month) => {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
};
export function monthsInWindow() {
  const months = [];
  for (
    let m = monthNumber(monthWindow.from_month);
    m < monthNumber(monthWindow.to_month);
    m++
  )
    months.push(
      `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`,
    );
  return months;
}
export function interpolatedMonthBlock(month) {
  const first = monthNumber(monthWindow.from_month);
  const months = monthNumber(monthWindow.to_month) - first;
  const share = (monthNumber(month) - first) / months;
  return Math.round(
    blockWindow.from_block +
      share * (blockWindow.to_block - blockWindow.from_block),
  );
}

const rowsOf = (subject, rows) =>
  Object.fromEntries(
    Object.entries(subject.binds).map(([kind, bind]) => [kind, rows[bind]]),
  );

function requireAscendingBlocks(subject, bind, list) {
  const { from_block: from, to_block: to } = windowOf(bind);
  list.forEach((row, i) => {
    if (row.block < from || row.block >= to)
      throw new Error(
        `${subject.name}: ${bind} has a row at block ${row.block}, outside [${from}, ${to}).`,
      );
    if (i > 0 && row.block <= list[i - 1].block)
      throw new Error(
        `${subject.name}: ${bind} block ${row.block} is not after block ${list[i - 1].block}.`,
      );
  });
}

const weiPerYearBand = [10n ** 14n, 10n ** 19n];
const yearSeconds = 365n * 86400n;

function requireWei(subject, list) {
  list.forEach((row, i) => {
    if (!/^[0-9]+$/.test(row.cost))
      throw new Error(
        `${subject.name}: cost "${row.cost}" at block ${row.block} is not a non-negative integer of wei.`,
      );
    if (i === 0) return;
    const years =
      (BigInt(row.expires) - BigInt(list[i - 1].expires)) / yearSeconds;
    if (BigInt(row.cost) === 0n) return;
    const perYear = BigInt(row.cost) / (years || 1n);
    if (perYear < weiPerYearBand[0] || perYear > weiPerYearBand[1])
      throw new Error(
        `${subject.name}: cost ${row.cost} at block ${row.block} is ${perYear} per year, outside ${weiPerYearBand.join(" to ")} wei per year; is it in wei?`,
      );
  });
}

function requireLaterExpiry(subject, list) {
  list.forEach((row, i) => {
    if (i > 0 && BigInt(row.expires) <= BigInt(list[i - 1].expires))
      throw new Error(
        `${subject.name}: the renewal at block ${row.block} expires at ${row.expires}, not later than the previous ${list[i - 1].expires}.`,
      );
  });
}

function requireEveryMonth(subject, list) {
  const months = monthsInWindow();
  const expected = new Set(months);
  const seen = new Set();
  const unexpected = [];
  for (const { month } of list) {
    if (!expected.has(month) || seen.has(month)) unexpected.push(month);
    seen.add(month);
  }
  const missing = months.filter((month) => !seen.has(month));
  const problems = [
    missing.length && `is missing ${missing.join(", ")}`,
    unexpected.length &&
      `has extra or duplicate rows for ${unexpected.join(", ")}`,
  ].filter(Boolean);
  if (problems.length)
    throw new Error(
      `${subject.name}: address record ${problems.join(" and ")}.`,
    );
}

function requireGracePeriod(subject, registration, wrapped) {
  for (const row of wrapped.filter((r) => r.owner !== zeroAddress)) {
    const registrar = registration.filter((r) => r.block <= row.block).at(-1);
    if (
      registrar &&
      BigInt(row.expiry) !==
        BigInt(registrar.expires) + BigInt(gracePeriodSeconds)
    )
      throw new Error(
        `${subject.name}: wrapped expiry ${row.expiry} at block ${row.block} is not the registrar expiry ${registrar.expires} plus the 90-day grace period.`,
      );
  }
}

function requireSameName(subject, domain, checks) {
  for (const [bind, list, field] of checks)
    if (list.some((row) => row[field] !== domain[0][field]))
      throw new Error(
        `${subject.name}: ${bind} has a row for a different name.`,
      );
}

const totalCost = (list) =>
  list.reduce((sum, row) => sum + BigInt(row.cost), 0n);
const renewalsOf = (registration) => registration.slice(1);

export function check(rows) {
  return subjects.flatMap((subject) => {
    const { domain, registration, address, wrapped } = rowsOf(subject, rows);
    if (!domain.length || !registration.length)
      throw new Error(`${subject.name}: no registry or registrar rows.`);
    requireAscendingBlocks(subject, subject.binds.domain, domain);
    requireAscendingBlocks(subject, subject.binds.registration, registration);
    requireAscendingBlocks(subject, subject.binds.wrapped, wrapped);
    requireLaterExpiry(subject, registration);
    requireGracePeriod(subject, registration, wrapped);
    requireWei(subject, registration);
    requireEveryMonth(subject, address);
    requireSameName(subject, domain, [
      [subject.binds.registration, registration, "labelhash"],
      [subject.binds.address, address, "node"],
      [subject.binds.wrapped, wrapped, "node"],
    ]);
    return [
      `${subject.name}: ${domain.length} registry rows in ascending block order, ${changes(domain, "owner").length} owner changes`,
      `${subject.name}: ${renewalsOf(registration).length} renewals, each expiring later than the one before, costs non-negative (${formatEth(totalCost(renewalsOf(registration)))} in total)`,
      `${subject.name}: address record present for all ${monthsInWindow().length} months`,
    ];
  });
}

export function shape(rows) {
  const span = blockWindow.to_block - blockWindow.from_block;
  const maxCost = subjects
    .flatMap((subject) => rowsOf(subject, rows).registration)
    .reduce(
      (max, row) => (BigInt(row.cost) > max ? BigInt(row.cost) : max),
      1n,
    );
  const named = subjects.map((subject) => {
    const { domain, address, registration } = rowsOf(subject, rows);
    const events = timeline(
      subject,
      rowsOf(subject, rows),
      interpolatedMonthBlock,
    );
    return {
      name: subject.name,
      events,
      renewals: String(renewalsOf(registration).length),
      renewalCost: formatEth(totalCost(renewalsOf(registration))),
      expires: formatDate(registration.at(-1).expires),
      ownerChanges: String(changes(domain, "owner").length),
      owner: shortAddress(domain.at(-1).owner),
      addressChanges: String(changes(address, "address").length),
    };
  });
  return {
    blockWindow,
    monthWindow,
    kinds: Object.entries(kindLabels).map(([kind, label]) => ({ kind, label })),
    subjects: named.map(({ events, ...headline }) => ({
      ...headline,
      marks: events.map((event) => ({
        kind: event.kind,
        position: (event.block - blockWindow.from_block) / span,
        costBasisPoints:
          event.cost === undefined
            ? 0
            : Number((event.cost * basisPoints) / maxCost),
      })),
    })),
    timeline: named
      .flatMap((subject) => subject.events)
      .sort((a, b) => a.block - b.block)
      .map(({ subject, kind, when, text }) => ({
        subject,
        kind: kindLabels[kind],
        when,
        text,
      })),
  };
}
