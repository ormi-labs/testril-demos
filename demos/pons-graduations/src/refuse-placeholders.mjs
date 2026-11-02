import spec from "../testril.json" with { type: "json" };

const address = /^0x[0-9a-fA-F]{40}$/;

function* addresses(value, key = "") {
  if (typeof value === "string") yield [key, value];
  else if (value && typeof value === "object")
    for (const [name, inner] of Object.entries(value))
      yield* addresses(inner, name);
}

const placeholders = spec.binds.flatMap((bind) =>
  [...addresses(bind.params)]
    .filter(([key, value]) => key !== "by" && !address.test(value))
    .map(([key, value]) => `${bind.name}.${key} = ${value}`),
);

if (placeholders.length > 0) {
  console.error(
    `Replace these placeholders in testril.json before recording:\n${placeholders.join("\n")}`,
  );
  process.exit(1);
}
