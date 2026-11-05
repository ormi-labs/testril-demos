const blockClock = [
  [9380380, 1580344632],
  [15537394, 1663224179],
];
const postMergeBlockSeconds = 12;

export function secondsOfBlock(block) {
  const [[block0, seconds0], [block1, seconds1]] = blockClock;
  return block >= block1
    ? seconds1 + (block - block1) * postMergeBlockSeconds
    : seconds0 + ((block - block0) * (seconds1 - seconds0)) / (block1 - block0);
}

export const secondsOfMonth = (month) =>
  Date.parse(`${month}-01T00:00:00Z`) / 1000;

export const nameWrapper = "0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401";
export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const kindLabels = {
  owner: "Owner",
  resolver: "Resolver",
  address: "Address record",
  registration: "First in window",
  renewal: "Renewal",
  wrapper: "NameWrapper",
};

export const changes = (list, field) =>
  list.filter((row, i) => i > 0 && row[field] !== list[i - 1][field]);

export function formatEth(wei) {
  const tenThousandths = (wei + 5n * 10n ** 13n) / 10n ** 14n;
  return `${tenThousandths / 10000n}.${String(tenThousandths % 10000n).padStart(4, "0")} ETH`;
}

export const formatDate = (seconds) =>
  new Date(Number(seconds) * 1000).toISOString().slice(0, 10);

export const shortAddress = (address) =>
  address === zeroAddress
    ? "none"
    : address === nameWrapper
      ? "NameWrapper"
      : `${address.slice(0, 6)}…${address.slice(-4)}`;

function registryEvents(subject, domain) {
  const event = (field, row, verb) => ({
    subject: subject.name,
    kind: field,
    seconds: secondsOfBlock(row.block),
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
    seconds: secondsOfBlock(row.block),
    when: `block ${row.block}`,
    text: `${i === 0 ? "First in window: paid" : "Renewed"} until ${formatDate(row.expires)} for ${formatEth(BigInt(row.cost))}`,
    cost: BigInt(row.cost),
  }));
}

function addressEvents(subject, address) {
  return changes(address, "address").map((row) => ({
    subject: subject.name,
    kind: "address",
    seconds: secondsOfMonth(row.month),
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
      seconds: secondsOfBlock(row.block),
      when: `block ${row.block}`,
      text,
    };
  });
}

export function timeline(subject, { domain, registration, address, wrapped }) {
  return [
    ...registryEvents(subject, domain),
    ...renewalEvents(subject, registration),
    ...addressEvents(subject, address),
    ...wrapperEvents(subject, wrapped),
  ].sort((a, b) => a.seconds - b.seconds);
}
