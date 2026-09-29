import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const revision = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
const source = `https://raw.githubusercontent.com/skywind3000/ECDICT/${revision}`;
const output = fileURLToPath(
  new URL("../frontend/static/dictionaries/en/", import.meta.url),
);
const csv = process.argv[2]
  ? await readFile(process.argv[2], "utf8")
  : await (await fetch(`${source}/ecdict.csv`)).text();
const sourceSha256 = createHash("sha256").update(csv).digest("hex");
if (
  sourceSha256 !==
  "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
) {
  throw new Error("CSV does not match the pinned ECDICT revision");
}

function* rows(text) {
  let row = [],
    field = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && character === "\n") {
      row.push(field.replace(/\r$/, ""));
      yield row;
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}

const valid = /^[a-z]+(?:['-][a-z]+)*$/;
const entries = new Map();
for (const row of rows(csv)) {
  const [
    original,
    phonetic,
    definition,
    translation,
    ,
    ,
    ,
    tag,
    bnc,
    frq,
    exchange,
  ] = row;
  const word = original.toLowerCase();
  if (!valid.test(word) || word.length > 64 || (!definition && !translation))
    continue;
  if (entries.has(word) && original !== word) continue;
  entries.set(word, {
    word,
    phonetic,
    definition: definition.replaceAll("\\n", "\n"),
    translation: translation.replaceAll("\\n", "\n"),
    tags: tag.split(" ").filter(Boolean),
    frequency: Number(frq) || Number(bnc) || 0,
    forms: Object.fromEntries(
      exchange
        .split("/")
        .map((part) => part.split(":"))
        .filter(([key, value]) => /^[pdinr30s]$/.test(key) && value),
    ),
  });
}
if (entries.size < 10000)
  throw new Error("Dictionary input is missing or invalid");
const shards = new Map();
function shard(word) {
  const key = word
    .slice(0, 2)
    .padEnd(2, "_")
    .replaceAll("'", "_")
    .replaceAll("-", "_");
  if (!shards.has(key)) shards.set(key, { entries: {}, aliases: {} });
  return shards.get(key);
}
for (const [word, entry] of [...entries].sort(([a], [b]) =>
  a.localeCompare(b, "en"),
)) {
  shard(word).entries[word] = entry;
  for (const [kind, value] of Object.entries(entry.forms)) {
    if (kind === "0") continue;
    for (const form of value.split("/")) {
      if (!valid.test(form) || entries.has(form)) continue;
      const aliases = shard(form).aliases;
      aliases[form] = [...new Set([...(aliases[form] ?? []), word])];
    }
  }
}
await mkdir(output, { recursive: true });
const files = {};
for (const [key, data] of [...shards].sort(([a], [b]) =>
  a.localeCompare(b, "en"),
)) {
  const content = JSON.stringify(data);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const name = `${key}.${hash}.json`;
  await writeFile(`${output}/${name}`, content + "\n");
  files[key] = name;
}
await writeFile(
  `${output}/manifest.json`,
  JSON.stringify(
    {
      version: 1,
      source: "ECDICT",
      revision,
      sourceSha256: createHash("sha256").update(csv).digest("hex"),
      count: entries.size,
      files,
    },
    null,
    2,
  ) + "\n",
);
const license = await fetch(`${source}/LICENSE`);
if (!license.ok) throw new Error("Could not download dictionary license");
await writeFile(`${output}/LICENSE.txt`, await license.text());
console.log(`Generated ${entries.size} entries in ${shards.size} shards`);
