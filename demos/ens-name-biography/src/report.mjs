import spec from "../testril.json" with { type: "json" };

export const zeroAddress = "0x0000000000000000000000000000000000000000";
const weiPerEth = 10n ** 18n;
const kindLabels = {
  owner: "Owner",
  resolver: "Resolver",
  address: "Address record",
  registration: "Registration",
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
// Month rows carry no block; place them on the block axis by linear interpolation.
export function monthBlock(month) {
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
  const seen = new Set(list.map((row) => row.month));
  const missing = months.filter((month) => !seen.has(month));
  if (missing.length || list.length !== months.length)
    throw new Error(
      `${subject.name}: address record is missing ${missing.join(", ") || "months"}.`,
    );
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
  list.filter((row, i) => row[field] !== (list[i - 1]?.[field] ?? zeroAddress));

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
    requireEveryMonth(subject, address);
    requireSameName(subject, domain, [
      [subject.binds.registration, registration, "labelhash"],
      [subject.binds.address, address, "node"],
      [subject.binds.wrapped, wrapped, "node"],
    ]);
    return [
      `${subject.name}: ${domain.length} registry rows in ascending block order, ${changes(domain, "owner").length} owner changes`,
      `${subject.name}: ${registration.length - 1} renewals, each expiring later than the one before, costs non-negative (${formatEth(totalCost(registration))} in total)`,
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
  return domain.flatMap((row, i) => {
    const first = i === 0;
    const event = (kind, text) => ({
      subject: subject.name,
      kind,
      block: row.block,
      when: `block ${row.block}`,
      text,
    });
    return [
      row.owner !== (domain[i - 1]?.owner ?? zeroAddress) &&
        event(
          "owner",
          `${first ? "Owner set" : "Owner changed"} to ${shortAddress(row.owner)}`,
        ),
      row.resolver !== (domain[i - 1]?.resolver ?? zeroAddress) &&
        event(
          "resolver",
          `${first ? "Resolver set" : "Resolver changed"} to ${shortAddress(row.resolver)}`,
        ),
    ].filter(Boolean);
  });
}

function renewalEvents(subject, registration) {
  return registration.map((row, i) => ({
    subject: subject.name,
    kind: i === 0 ? "registration" : "renewal",
    block: row.block,
    when: `block ${row.block}`,
    text: `${i === 0 ? "Registered" : "Renewed"} until ${formatDate(row.expires)} for ${formatEth(BigInt(row.cost))}`,
    ethFloat: Number(BigInt(row.cost)) / Number(weiPerEth),
  }));
}

function addressEvents(subject, address) {
  return changes(address, "address").map((row) => ({
    subject: subject.name,
    kind: "address",
    block: monthBlock(row.month),
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
  const named = subjects.map((subject) => {
    const { domain, registration } = rowsOf(subject, rows);
    const events = timeline(subject, rows);
    const count = (kind) =>
      events.filter((event) => event.kind === kind).length;
    return {
      name: subject.name,
      events,
      renewals: String(count("renewal")),
      renewalCost: formatEth(totalCost(registration)),
      expires: formatDate(registration.at(-1).expires),
      ownerChanges: String(count("owner")),
      owner: shortAddress(domain.at(-1).owner),
      addressChanges: String(count("address")),
    };
  });
  return {
    blockWindow,
    monthWindow,
    kinds: Object.entries(kindLabels).map(([kind, label]) => ({ kind, label })),
    subjects: named.map((subject) => ({
      name: subject.name,
      renewals: subject.renewals,
      renewalCost: subject.renewalCost,
      expires: subject.expires,
      ownerChanges: subject.ownerChanges,
      owner: subject.owner,
      addressChanges: subject.addressChanges,
      marks: subject.events.map((event) => ({
        kind: event.kind,
        position: (event.block - blockWindow.from_block) / span,
        eth: event.ethFloat ?? 0,
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
