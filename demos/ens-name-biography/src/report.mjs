import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const gracePeriodSeconds = 90 * 86400;
const basisPoints = 10000n;
const kindLabels = {
  owner: "Owner",
  resolver: "Resolver",
  address: "Address record",
  registration: "First in window",
  renewal: "Renewal",
  wrapper: "NameWrapper",
};

const bindByName = Object.fromEntries(spec.binds.map((b) => [b.name, b]));
export const windowOf = (bindName) => bindByName[bindName].window;
export const nameWrapper = spec.binds.find(
  (bind) => bind.function_slug === "ens.wrapped_domain",
).params.name_wrapper;

export const subjects = spec.binds
  .filter((bind) => bind.function_slug === "ens.domain")
  .map((bind) => {
    const label = bind.params.name.split(".")[0];
    return {
      name: bind.params.name,
      label,
      binds: Object.fromEntries(
        ["domain", "registration", "address", "wrapped"].map((kind) => [
          kind,
          `${label}-${kind}`,
        ]),
      ),
    };
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

function requireWei(subject, row) {
  if (!/^[0-9]+$/.test(row.cost))
    throw new Error(
      `${subject.name}: cost "${row.cost}" at block ${row.block} is not a non-negative integer of wei.`,
    );
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
const changes = (list, field) =>
  list.filter((row, i) => i > 0 && row[field] !== list[i - 1][field]);
const renewalsOf = (registration) => registration.slice(1);

export function check(rows) {
  return subjects.flatMap((subject) => {
    const { domain, registration, address, wrapped } = rowsOf(subject, rows);
    if (!domain.length || !registration.length)
      throw new Error(`${subject.name}: no registry or registrar rows.`);
    requireAscendingBlocks(subject, subject.binds.domain, domain);
    requireAscendingBlocks(subject, subject.binds.registration, registration);
    requireAscendingBlocks(subject, subject.binds.wrapped, wrapped);
    registration.forEach((row) => requireWei(subject, row));
    requireLaterExpiry(subject, registration);
    requireGracePeriod(subject, registration, wrapped);
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

export function formatEth(wei) {
  const tenThousandths = (wei + 5n * 10n ** 13n) / 10n ** 14n;
  return `${tenThousandths / 10000n}.${String(tenThousandths % 10000n).padStart(4, "0")} ETH`;
}

const formatDate = (seconds) =>
  new Date(Number(seconds) * 1000).toISOString().slice(0, 10);

const shortAddress = (address) =>
  address === zeroAddress
    ? "none"
    : address === nameWrapper
      ? "NameWrapper"
      : `${address.slice(0, 6)}…${address.slice(-4)}`;

function registryEvents(subject, domain) {
  const event = (field, row, verb) => ({
    subject: subject.name,
    kind: field,
    block: row.block,
    when: `block ${row.block}`,
    text: `${kindLabels[field]} ${verb} ${shortAddress(row[field])}`,
  });
  return ["owner", "resolver"].flatMap((field) => [
    ...(domain[0][field] === zeroAddress
      ? []
      : [event(field, domain[0], "set to")]),
    ...changes(domain, field).map((row) => event(field, row, "changed to")),
  ]);
}

function renewalEvents(subject, registration) {
  return registration.map((row, i) => ({
    subject: subject.name,
    kind: i === 0 ? "registration" : "renewal",
    block: row.block,
    when: `block ${row.block}`,
    text: `${i === 0 ? "First in window: paid" : "Renewed"} until ${formatDate(row.expires)} for ${formatEth(BigInt(row.cost))}`,
    cost: BigInt(row.cost),
  }));
}

function addressEvents(subject, address) {
  return changes(address, "address").map((row) => ({
    subject: subject.name,
    kind: "address",
    block: interpolatedMonthBlock(row.month),
    when: `month ${row.month}`,
    text: `Points to ${shortAddress(row.address)} via resolver ${shortAddress(row.resolver)}`,
  }));
}

function wrapperEvents(subject, wrapped) {
  return wrapped.map((row, i) => {
    const previous = wrapped[i - 1];
    const parts = [
      row.owner !== (previous?.owner ?? zeroAddress) &&
        `owner ${shortAddress(row.owner)}`,
      row.fuses !== (previous?.fuses ?? "0") && `fuses ${row.fuses}`,
      row.expiry !== previous?.expiry && `expiry ${formatDate(row.expiry)}`,
    ].filter(Boolean);
    const text =
      row.owner === zeroAddress && previous
        ? "Unwrapped"
        : `${i === 0 ? "Wrapped" : "Updated"}: ${parts.join(", ")}`;
    return {
      subject: subject.name,
      kind: "wrapper",
      block: row.block,
      when: `block ${row.block}`,
      text,
    };
  });
}

function timeline(subject, rows) {
  const { domain, registration, address, wrapped } = rowsOf(subject, rows);
  return [
    ...registryEvents(subject, domain),
    ...renewalEvents(subject, registration),
    ...addressEvents(subject, address),
    ...wrapperEvents(subject, wrapped),
  ].sort((a, b) => a.block - b.block);
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
    const events = timeline(subject, rows);
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
