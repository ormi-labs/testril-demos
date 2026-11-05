import {
  bindsAt,
  gracePeriodSeconds,
  monthsInWindow,
  nameWrapper,
  secondsOfBlock,
  secondsOfMonth,
  subjectsOf,
  zeroAddress,
} from "../src/report.mjs";

export const fixtureNow = Date.parse("2026-11-02T12:00:00Z");
export const fixtureBinds = bindsAt(fixtureNow);
const subjects = subjectsOf(fixtureBinds);
const registryWindow = fixtureBinds.find(
  (bind) => bind.function_slug === "ens.domain",
).window;
const firstBlockSeconds = Date.parse(registryWindow.from_time) / 1000;
const lastBlockSeconds = Date.parse(registryWindow.to_time) / 1000;
const firstBlock = 9380380;
const mergeBlock = 15537394;
const mergeSeconds = secondsOfBlock(mergeBlock);

function blockOfSeconds(seconds) {
  return seconds >= mergeSeconds
    ? mergeBlock + Math.round((seconds - mergeSeconds) / 12)
    : Math.round(
        firstBlock +
          ((seconds - firstBlockSeconds) * (mergeBlock - firstBlock)) /
            (mergeSeconds - firstBlockSeconds),
      );
}

const yearSeconds = 365 * 86400;
const ethNode =
  "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
const publicResolver2020 = "0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41";
const publicResolver2023 = "0x231b0ee14048e9dccd1d247744d114a4eb5e8e63";
const fixtureAddress = (tag, n) =>
  `0x${tag}${String(n).padStart(40 - tag.length, "0")}`;

const stories = {
  "vitalik.eth": {
    node: "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835",
    labelhash:
      "0xaf2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc",
    owners: [fixtureAddress("a11ce", 1), fixtureAddress("b0b", 2)],
    registrations: [
      { windowShare: 0.003, years: 3 },
      { windowShare: 0.17, years: 1 },
      { windowShare: 0.31, years: 2 },
      { windowShare: 0.46, years: 1 },
      { windowShare: 0.64, years: 5 },
      { windowShare: 0.86, years: 4 },
    ],
    registry: [
      { windowShare: 0.003, owner: 0, resolver: publicResolver2020 },
      { windowShare: 0.5, resolver: publicResolver2023 },
      { windowShare: 0.55, owner: 1 },
    ],
    wrapper: [
      { windowShare: 0.58, owner: 1, fuses: "65537" },
      { windowShare: 0.83, owner: 0, fuses: "196611" },
    ],
    addresses: [
      { month: 0, address: 0 },
      { month: 40, address: 1 },
      { month: 66, address: 0 },
    ],
  },
  "nick.eth": {
    node: "0x05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00",
    labelhash:
      "0x5d5727cb0fb76e4944eafb88ec9a3cf0b3c9025a4b2f947729137c5d7f84f68f",
    owners: [fixtureAddress("ca401", 3), fixtureAddress("da7e", 4)],
    registrations: [
      { windowShare: 0.01, years: 2 },
      { windowShare: 0.13, years: 1 },
      { windowShare: 0.24, years: 1 },
      { windowShare: 0.4, years: 3 },
      { windowShare: 0.59, years: 2 },
      { windowShare: 0.78, years: 5 },
      { windowShare: 0.93, years: 5 },
    ],
    registry: [
      { windowShare: 0.01, owner: 0, resolver: publicResolver2020 },
      { windowShare: 0.37, owner: 1 },
      { windowShare: 0.7, resolver: publicResolver2023 },
    ],
    wrapper: [{ windowShare: 0.72, owner: 1, fuses: "65537" }],
    addresses: [
      { month: 2, address: 0 },
      { month: 58, address: 1 },
    ],
  },
};

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const blockAt = (windowShare, random) =>
  blockOfSeconds(
    firstBlockSeconds + windowShare * (lastBlockSeconds - firstBlockSeconds),
  ) + Math.floor(random() * 5000);
const secondsAt = (block) => Math.round(secondsOfBlock(block));

function registrationRows(story, random) {
  let expires = 0;
  return story.registrations.map(({ windowShare, years }) => {
    const block = blockAt(windowShare, random);
    expires = (expires || secondsAt(block)) + years * yearSeconds;
    const cost =
      BigInt(years) *
      (3_000_000_000_000_000n + BigInt(Math.floor(random() * 4e15)));
    return {
      block,
      labelhash: story.labelhash,
      expires: String(expires),
      cost: cost.toString(),
    };
  });
}

function domainRows(story, wrapBlock, random) {
  const changes = [
    ...story.registry.map((change) => ({
      ...change,
      block: blockAt(change.windowShare, random),
    })),
    { owner: nameWrapper, block: wrapBlock },
  ].sort((a, b) => a.block - b.block);
  let state = { owner: zeroAddress, resolver: zeroAddress };
  return changes.map(({ block, owner, resolver }) => {
    state = {
      owner: owner === undefined ? state.owner : (story.owners[owner] ?? owner),
      resolver: resolver ?? state.resolver,
    };
    return {
      block,
      node: story.node,
      ...state,
      parent: ethNode,
      labelhash: story.labelhash,
    };
  });
}

function wrappedRows(story, wrapBlocks, registrations) {
  return story.wrapper.map(({ owner, fuses }, i) => {
    const block = wrapBlocks[i];
    const registered =
      registrations.filter((row) => row.block <= block).at(-1) ??
      registrations[0];
    return {
      block,
      node: story.node,
      owner: story.owners[owner],
      fuses,
      expiry: String(Number(registered.expires) + gracePeriodSeconds),
    };
  });
}

function addressRows(story, domain) {
  return monthsInWindow(fixtureBinds).map((month, index) => {
    const resolver =
      domain
        .filter((row) => secondsOfBlock(row.block) <= secondsOfMonth(month))
        .at(-1)?.resolver ?? zeroAddress;
    const step = story.addresses.filter((s) => s.month <= index).at(-1);
    const address =
      resolver === zeroAddress || !step
        ? zeroAddress
        : story.owners[step.address];
    return { month, node: story.node, resolver, address };
  });
}

export function fixture() {
  const random = seeded(11);
  const rows = {};
  for (const subject of subjects) {
    const story = stories[subject.name];
    const registration = registrationRows(story, random);
    const wrapBlocks = story.wrapper.map(({ windowShare }) =>
      blockAt(windowShare, random),
    );
    const domain = domainRows(story, wrapBlocks[0], random);
    rows[subject.binds.domain] = domain;
    rows[subject.binds.registration] = registration;
    rows[subject.binds.address] = addressRows(story, domain);
    rows[subject.binds.wrapped] = wrappedRows(story, wrapBlocks, registration);
  }
  return rows;
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function fixtureRows() {
  const rows = fixture();
  return (bound) =>
    rows[
      fixtureBinds.find(
        (candidate) =>
          candidate.function_slug === bound.function_slug &&
          candidate.chain_id === bound.chain_id &&
          sameParams(candidate.params, bound.params),
      ).name
    ];
}
