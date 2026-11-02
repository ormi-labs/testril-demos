import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import spec from "../testril.json" with { type: "json" };
import {
  blockWindow,
  monthBlock,
  monthsInWindow,
  subjects,
  windowOf,
  zeroAddress,
} from "../src/report.mjs";

const recordedAt = "2026-11-02T00:00:00.000Z";
const yearSeconds = 365 * 86400;
const graceSeconds = 90 * 86400;
const firstBlockSeconds = Date.UTC(2020, 1, 4) / 1000;
const lastBlockSeconds = Date.UTC(2026, 10, 2) / 1000;
const ethNode =
  "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
const oldResolver = "0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41";
const publicResolver = "0x231b0ee14048e9dccd1d247744d114a4eb5e8e63";

// at: share of the block window; years: registration or renewal length.
const stories = {
  "vitalik.eth": {
    node: "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835",
    labelhash:
      "0xaf2caa1c2ca1d027f1ac823b529d0a67cd144264b2789fa2ea4d63a67c7103cc",
    owners: [
      "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "0x1db3439a222c519ab44bb1144fc28167b4fa6ee6",
    ],
    registrations: [
      { at: 0.003, years: 3 },
      { at: 0.17, years: 1 },
      { at: 0.31, years: 2 },
      { at: 0.46, years: 1 },
      { at: 0.64, years: 5 },
      { at: 0.86, years: 4 },
    ],
    registry: [
      { at: 0.003, owner: 0, resolver: oldResolver },
      { at: 0.12, resolver: publicResolver },
      { at: 0.55, owner: 1 },
      { at: 0.8, owner: 0 },
    ],
    wrapper: [
      { at: 0.58, owner: 1, fuses: "65537" },
      { at: 0.83, owner: 0, fuses: "196611" },
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
    owners: [
      "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
      "0x7a16ff8270133f063aab6c9977183d9e72835428",
    ],
    registrations: [
      { at: 0.01, years: 2 },
      { at: 0.13, years: 1 },
      { at: 0.24, years: 1 },
      { at: 0.4, years: 3 },
      { at: 0.59, years: 2 },
      { at: 0.78, years: 5 },
      { at: 0.93, years: 5 },
    ],
    registry: [
      { at: 0.01, owner: 0, resolver: publicResolver },
      { at: 0.37, owner: 1 },
      { at: 0.7, resolver: oldResolver },
      { at: 0.9, resolver: publicResolver },
    ],
    wrapper: [{ at: 0.72, owner: 1, fuses: "65537" }],
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

const blockAt = (share, random) =>
  blockWindow.from_block +
  Math.floor(share * (blockWindow.to_block - blockWindow.from_block)) +
  Math.floor(random() * 5000);
const secondsAt = (block) =>
  Math.round(
    firstBlockSeconds +
      ((block - blockWindow.from_block) /
        (blockWindow.to_block - blockWindow.from_block)) *
        (lastBlockSeconds - firstBlockSeconds),
  );

function registrationRows(story, random) {
  let expires = 0;
  return story.registrations.map(({ at, years }) => {
    const block = blockAt(at, random);
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

function domainRows(story, random) {
  let state = { owner: zeroAddress, resolver: zeroAddress };
  return story.registry.map(({ at, owner, resolver }) => {
    state = {
      owner: owner === undefined ? state.owner : story.owners[owner],
      resolver: resolver ?? state.resolver,
    };
    return {
      block: blockAt(at, random),
      node: story.node,
      ...state,
      parent: ethNode,
      labelhash: story.labelhash,
    };
  });
}

function wrappedRows(story, registrations, random) {
  return story.wrapper.map(({ at, owner, fuses }) => {
    const block = blockAt(at, random);
    const registered =
      registrations.filter((row) => row.block <= block).at(-1) ??
      registrations[0];
    return {
      block,
      node: story.node,
      owner: story.owners[owner],
      fuses,
      expiry: String(Number(registered.expires) + graceSeconds),
    };
  });
}

function addressRows(story, domain) {
  return monthsInWindow().map((month, index) => {
    const resolver =
      domain.filter((row) => row.block <= monthBlock(month)).at(-1)?.resolver ??
      zeroAddress;
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
    const domain = domainRows(story, random);
    rows[subject.binds.domain] = domain;
    rows[subject.binds.registration] = registration;
    rows[subject.binds.address] = addressRows(story, domain);
    rows[subject.binds.wrapped] = wrappedRows(story, registration, random);
  }
  return {
    demo: spec.demo,
    source: "synthetic",
    recordedAt,
    boundFunctions: Object.fromEntries(
      spec.binds.map((bind) => [
        bind.name,
        { function_slug: bind.function_slug, chain_id: bind.chain_id },
      ]),
    ),
    window: Object.fromEntries(
      spec.binds.map((bind) => [bind.name, windowOf(bind.name)]),
    ),
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(
    new URL("../recordings/report.json", import.meta.url),
    `${JSON.stringify(fixture(), null, 2)}\n`,
  );
