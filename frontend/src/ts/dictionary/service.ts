import { z } from "zod";
import { EntrySchema, normalizeWord, shardKey, WordSchema } from "./schema";
import type { DictionaryEntry } from "./schema";

const ManifestSchema = z.object({
  version: z.literal(1),
  count: z.number(),
  files: z.record(
    z.string(),
    z.string().regex(/^[a-z_]{2}\.[a-f0-9]{12}\.json$/),
  ),
});
const ShardSchema = z.object({
  entries: z.record(EntrySchema),
  aliases: z.record(z.array(WordSchema)),
});
type Shard = z.infer<typeof ShardSchema>;
const base = `${import.meta.env.BASE_URL}dictionaries/en/`;
let manifest: Promise<z.infer<typeof ManifestSchema>> | undefined;
const cache = new Map<string, Promise<Shard>>();

async function readJson(file: string): Promise<unknown> {
  const response = await fetch(`${base}${file}`);
  if (!response.ok) {
    throw new Error(
      "词典资源加载失败，请重试。离线使用需由本地静态服务器提供词典文件。",
    );
  }
  return response.json();
}

async function loadShard(word: string): Promise<Shard> {
  manifest ??= readJson("manifest.json")
    .then((value) => ManifestSchema.parse(value))
    .catch((error: unknown) => {
      manifest = undefined;
      throw error;
    });
  const key = shardKey(word);
  const file = (await manifest).files[key];
  if (file === undefined) return { entries: {}, aliases: {} };
  const existing = cache.get(file);
  if (existing) {
    cache.delete(file);
    cache.set(file, existing);
    return existing;
  }
  const pending = readJson(file)
    .then((value) => ShardSchema.parse(value))
    .catch((error: unknown) => {
      cache.delete(file);
      throw error;
    });
  cache.set(file, pending);
  if (cache.size > 12) cache.delete(cache.keys().next().value as string);
  return pending;
}

export type LookupResult = {
  query: string;
  entry?: DictionaryEntry;
  alternatives: string[];
};
export async function lookupWord(input: string): Promise<LookupResult> {
  const query = normalizeWord(input);
  if (!WordSchema.safeParse(query).success) return { query, alternatives: [] };
  const data = await loadShard(query);
  const exact = Object.hasOwn(data.entries, query)
    ? data.entries[query]
    : undefined;
  if (exact) return { query, entry: exact, alternatives: [] };
  const aliases = Object.hasOwn(data.aliases, query)
    ? (data.aliases[query] ?? [])
    : [];
  for (const lemma of aliases) {
    const entry = (await loadShard(lemma)).entries[lemma];
    if (entry) {
      return {
        query,
        entry,
        alternatives: aliases.filter((word) => word !== lemma),
      };
    }
  }
  const alternatives = Object.keys(data.entries)
    .filter((word) => word.startsWith(query))
    .slice(0, 8);
  return { query, alternatives };
}

export async function suggestWords(input: string): Promise<string[]> {
  const query = normalizeWord(input);
  if (query.length < 2 || !WordSchema.safeParse(query).success) return [];
  return Object.keys((await loadShard(query)).entries)
    .filter((word) => word.startsWith(query))
    .slice(0, 8);
}
