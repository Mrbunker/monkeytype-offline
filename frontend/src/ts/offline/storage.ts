import { IDBPDatabase, openDB } from "idb";
import { z } from "zod";
import {
  VocabularySchema,
  VocabularyBackupSchema,
  type VocabularyEntry,
} from "../dictionary/schema";
import {
  LocalResult,
  LocalResultSchema,
  recomputePersonalBests,
} from "./results";

const DATABASE_NAME = "monkeytype-local-practice";
const DATABASE_VERSION = 2;

type PracticeDatabase = {
  vocabulary: { key: string; value: VocabularyEntry };
  results: {
    key: string;
    value: LocalResult;
    indexes: { timestamp: number };
  };
};

export const ResultsBackupSchema = z
  .object({
    application: z.literal("monkeytype-local-practice"),
    version: z.literal(1),
    exportedAt: z.number().int().nonnegative(),
    results: z.array(LocalResultSchema).max(50_000),
  })
  .strict();

let databasePromise: Promise<IDBPDatabase<PracticeDatabase>> | undefined;

async function database(): Promise<IDBPDatabase<PracticeDatabase>> {
  databasePromise ??= Promise.resolve()
    .then(async () =>
      openDB<PracticeDatabase>(DATABASE_NAME, DATABASE_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            const results = db.createObjectStore("results", { keyPath: "_id" });
            results.createIndex("timestamp", "timestamp");
          }
          if (oldVersion < 2) {
            db.createObjectStore("vocabulary", { keyPath: "word" });
          }
        },
        blocking() {
          void databasePromise?.then((db) => db.close());
          databasePromise = undefined;
        },
        terminated() {
          databasePromise = undefined;
        },
      }),
    )
    .catch((error: unknown) => {
      databasePromise = undefined;
      throw new Error(
        "Local results storage is unavailable. Check browser storage permissions.",
        { cause: error },
      );
    });
  return databasePromise;
}

export async function readResults(): Promise<LocalResult[]> {
  const db = await database();
  const results = await db.getAllFromIndex("results", "timestamp");
  return results.map((result) => LocalResultSchema.parse(result));
}

/** Serialize read/modify/write inside one IndexedDB transaction, including across tabs. */
async function changeResults(
  change: (results: LocalResult[]) => LocalResult[],
): Promise<LocalResult[]> {
  const db = await database();
  const transaction = db.transaction("results", "readwrite");
  try {
    const previous = (await transaction.store.getAll()).map((result) =>
      LocalResultSchema.parse(result),
    );
    const next = recomputePersonalBests(change(previous));
    if (next.length > 50_000) {
      throw new Error(
        "Local history is limited to 50,000 results. Export a backup and remove older results first.",
      );
    }
    const oldById = new Map(previous.map((result) => [result._id, result]));
    const nextIds = new Set(next.map((result) => result._id));
    for (const old of previous) {
      if (!nextIds.has(old._id)) await transaction.store.delete(old._id);
    }
    for (const result of next) {
      const old = oldById.get(result._id);
      if (old === undefined || JSON.stringify(old) !== JSON.stringify(result)) {
        await transaction.store.put(result);
      }
    }
    await transaction.done;
    return next;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* already aborted */
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

export async function saveResult(result: LocalResult): Promise<LocalResult[]> {
  const parsed = LocalResultSchema.parse(result);
  return changeResults((results) => {
    if (results.some((item) => item._id === parsed._id)) return results;
    return [...results, parsed];
  });
}

export async function deleteResult(id: string): Promise<LocalResult[]> {
  return changeResults((results) =>
    results.filter((result) => result._id !== id),
  );
}

export async function exportResults(): Promise<string> {
  return JSON.stringify(
    {
      application: "monkeytype-local-practice",
      version: 1,
      exportedAt: Date.now(),
      results: await readResults(),
    },
    null,
    2,
  );
}

export async function importResults(json: string): Promise<{
  results: LocalResult[];
  imported: number;
}> {
  if (json.length > 50 * 1024 * 1024) throw new Error("Backup exceeds 50 MB.");
  // Validate everything before opening a write transaction. Never trust imported PB flags.
  const backup = ResultsBackupSchema.parse(JSON.parse(json) as unknown);
  let imported = 0;
  const results = await changeResults((previous) => {
    const knownIds = new Set(previous.map((result) => result._id));
    const additions = backup.results.filter((result) => {
      if (knownIds.has(result._id)) return false;
      knownIds.add(result._id);
      return true;
    });
    imported = additions.length;
    return [...previous, ...additions];
  });
  return { results, imported };
}

export async function readVocabulary(): Promise<VocabularyEntry[]> {
  return (await (await database()).getAll("vocabulary"))
    .map((entry) => VocabularySchema.parse(entry))
    .sort((a, b) => b.createdAt - a.createdAt || a.word.localeCompare(b.word));
}

export async function saveVocabulary(entry: VocabularyEntry): Promise<void> {
  const parsed = VocabularySchema.parse(entry);
  const transaction = (await database()).transaction("vocabulary", "readwrite");
  if (!(await transaction.store.get(parsed.word))) {
    if ((await transaction.store.count()) >= 10000) {
      await transaction.done;
      throw new Error("生词本已达 10,000 词，请先导出备份并清理。");
    }
    await transaction.store.put(parsed);
  }
  await transaction.done;
}

export async function deleteVocabulary(words: string[]): Promise<void> {
  const transaction = (await database()).transaction("vocabulary", "readwrite");
  for (const word of words) await transaction.store.delete(word);
  await transaction.done;
}

/** Merge results and vocabulary atomically; old backups leave vocabulary intact. */
export async function importPracticeData(
  json: string,
  vocabulary: VocabularyEntry[] = [],
): Promise<{ results: LocalResult[]; imported: number }> {
  const backup = ResultsBackupSchema.parse(JSON.parse(json) as unknown);
  const incoming = VocabularyBackupSchema.parse(vocabulary);
  const transaction = (await database()).transaction(
    ["results", "vocabulary"],
    "readwrite",
  );
  try {
    const previous = (await transaction.objectStore("results").getAll()).map(
      (result) => LocalResultSchema.parse(result),
    );
    const known = new Set(previous.map((result) => result._id));
    const additions = backup.results.filter((result) => {
      if (known.has(result._id)) return false;
      known.add(result._id);
      return true;
    });
    const results = recomputePersonalBests([...previous, ...additions]);
    if (results.length > 50000) {
      throw new Error("Backup would exceed 50,000 results.");
    }
    const vocabularyStore = transaction.objectStore("vocabulary");
    const saved = new Set(await vocabularyStore.getAllKeys());
    for (const entry of incoming) {
      if (saved.has(entry.word)) continue;
      saved.add(entry.word);
      if (saved.size > 10000) {
        throw new Error("Backup would exceed 10,000 vocabulary entries.");
      }
      await vocabularyStore.put(entry);
    }
    for (const result of results) {
      await transaction.objectStore("results").put(result);
    }
    await transaction.done;
    return { results, imported: additions.length };
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* already aborted */
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}
