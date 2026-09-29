import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  EntrySchema,
  normalizeWord,
  shardKey,
  WordSchema,
} from "../../src/ts/dictionary/schema";
import { BackupSchema } from "../../src/ts/offline/backup-schema";

describe("dictionary lookup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const name = url.split("dictionaries/en/")[1];
        const json = await readFile(`static/dictionaries/en/${name}`, "utf8");
        return {
          ok: true,
          json: async () => Promise.resolve(JSON.parse(json) as unknown),
        };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes punctuation without turning phrases into words", () => {
    expect(normalizeWord("  ‘Don’t,’ ")).toBe("don't");
    expect(normalizeWord("(MOTHER-IN-LAW). ")).toBe("mother-in-law");
    expect(WordSchema.safeParse(normalizeWord("hello world")).success).toBe(
      false,
    );
    expect(WordSchema.safeParse(normalizeWord("123")).success).toBe(false);
    expect(shardKey("a")).toBe("a_");
    expect(shardKey("a-b")).toBe("a_");
  });

  it("uses shipped bilingual entries and shares concurrent shard requests", async () => {
    const { lookupWord } = await import("../../src/ts/dictionary/service");
    const [first, second] = await Promise.all([
      lookupWord("Curious!"),
      lookupWord("curious"),
    ]);
    expect(first.entry?.word).toBe("curious");
    expect(first.entry?.translation).toMatch(/好奇/);
    expect(first.entry?.definition).toBeTruthy();
    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(2);
    await lookupWord("curious");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("offers real prefixes and explicit not-found results", async () => {
    const { lookupWord, suggestWords } =
      await import("../../src/ts/dictionary/service");
    expect(await suggestWords("curio")).toContain("curious");
    expect((await lookupWord("zzzzzzzzzzzz")).entry).toBeUndefined();
    expect((await lookupWord("went")).entry?.forms["0"]).toContain("go");
    expect((await lookupWord("children")).entry?.forms["0"]).toContain("child");
    expect((await lookupWord("chalkpits")).entry?.word).toBe("chalkpit");
  });

  it("retries failed downloads instead of caching a rejected promise", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network unavailable"));
    const { lookupWord } = await import("../../src/ts/dictionary/service");
    await expect(lookupWord("curious")).rejects.toThrow();
    expect((await lookupWord("curious")).entry?.word).toBe("curious");
  });

  it("rejects unsafe shard filenames", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () =>
        Promise.resolve({
          version: 1,
          count: 1,
          files: { cu: "https://external.example/dictionary" },
        }),
    } as Response);
    const { lookupWord } = await import("../../src/ts/dictionary/service");
    await expect(lookupWord("curious")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("vocabulary backup validation", () => {
  const old = {
    application: "monkeytype-local-practice",
    version: 1,
    exportedAt: 1,
    results: [],
  };
  it("accepts old results-only backups and new vocabulary backups", () => {
    expect(BackupSchema.parse(old).vocabulary).toBeUndefined();
    expect(
      BackupSchema.parse({
        ...old,
        version: 2,
        vocabulary: [{ word: "curious", language: "english", createdAt: 1 }],
      }).vocabulary,
    ).toHaveLength(1);
  });
  it("rejects malformed words before importing anything", () => {
    expect(
      BackupSchema.safeParse({
        ...old,
        version: 2,
        vocabulary: [{ word: "<script>", language: "english", createdAt: 1 }],
      }).success,
    ).toBe(false);
    expect(BackupSchema.safeParse({ ...old, version: 3 }).success).toBe(false);
  });
});

it("ships valid shards with matching content hashes, reachable aliases and a complete manifest", async () => {
  const root = "static/dictionaries/en/";
  const manifest = JSON.parse(
    await readFile(`${root}manifest.json`, "utf8"),
  ) as { count: number; files: Record<string, string> };
  const words = new Set<string>();
  const targets: string[] = [];
  const schema = z.object({
    entries: z.record(EntrySchema),
    aliases: z.record(z.array(WordSchema)),
  });
  for (const [key, file] of Object.entries(manifest.files)) {
    const content = await readFile(`${root}${file}`, "utf8");
    expect(file).toContain(
      createHash("sha256").update(content.trimEnd()).digest("hex").slice(0, 12),
    );
    expect((await stat(`${root}${file}`)).size).toBeLessThan(25 * 1024 * 1024);
    const data = schema.parse(JSON.parse(content) as unknown);
    for (const [word, entry] of Object.entries(data.entries)) {
      if (shardKey(word) !== key || word !== entry.word) {
        throw new Error(`Misplaced entry: ${word}`);
      }
      words.add(word);
    }
    for (const [word, lemmas] of Object.entries(data.aliases)) {
      if (shardKey(word) !== key) throw new Error(`Misplaced alias: ${word}`);
      targets.push(...lemmas);
    }
  }
  expect(words.size).toBe(manifest.count);
  expect(targets.every((word) => words.has(word))).toBe(true);
}, 20000);
