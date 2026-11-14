import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(resolve(root, "public/build"), { recursive: true });
await build({
  entryPoints: [resolve(root, "public/app.js")],
  bundle: true,
  format: "esm",
  outfile: resolve(root, "public/build/app.js"),
});
await mkdir(resolve(root, "public/recordings"), { recursive: true });
await cp(resolve(root, "recordings"), resolve(root, "public/recordings"), {
  recursive: true,
});
await mkdir(resolve(root, "public/verification"), { recursive: true });
await cp(
  resolve(root, "verification/evidence/evidence.json"),
  resolve(root, "public/verification/evidence.json"),
);

const files = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name),
      path = relative(root, full).replaceAll("\\", "/");
    if (
      /^(?:node_modules|runtime|test-results|playwright-report)(?:\/|$)|^public\/(?:build|recordings|verification)(?:\/|$)|^public\/source\.zip$|^\.env(?!\.example$)|\.DS_Store$/.test(
        path,
      )
    )
      continue;
    if (entry.isDirectory()) await collect(full);
    else if (entry.isFile())
      files[`wallet-statement/${path}`] = new Uint8Array(await readFile(full));
  }
}
await collect(root);
await writeFile(
  resolve(root, "public/source.zip"),
  zipSync(files, { level: 6 }),
);
const verification = {};
for (const [path, bytes] of Object.entries(files)) {
  const part = path.slice("wallet-statement/".length);
  if (part.startsWith("verification/"))
    verification[part.slice("verification/".length)] = bytes;
}
verification["public/verification.js"] = new Uint8Array(
  await readFile(resolve(root, "public/verification.js")),
);
// The extracted verifier has no npm dependencies; keep its relative import valid.
verification["verify.mjs"] = new TextEncoder().encode(
  (await readFile(resolve(root, "verification/verify.mjs"), "utf8")).replace(
    '"../public/verification.js"',
    '"./public/verification.js"',
  ),
);
verification["package.json"] = new TextEncoder().encode(
  '{"type":"module","engines":{"node":">=22.13"}}\n',
);
await writeFile(
  resolve(root, "public/verification/source.zip"),
  zipSync(verification, { level: 6 }),
);
