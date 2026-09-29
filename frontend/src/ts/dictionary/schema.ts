import { z } from "zod";

export const WordSchema = z
  .string()
  .max(64)
  .regex(/^[a-z]+(?:['-][a-z]+)*$/);
export const EntrySchema = z.object({
  word: WordSchema,
  phonetic: z.string(),
  definition: z.string(),
  translation: z.string(),
  tags: z.array(z.string()),
  frequency: z.number().nonnegative(),
  forms: z.record(z.string(), z.string()),
});
export type DictionaryEntry = z.infer<typeof EntrySchema>;
export const VocabularySchema = z
  .object({
    word: WordSchema,
    language: z.literal("english"),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type VocabularyEntry = z.infer<typeof VocabularySchema>;
export const VocabularyBackupSchema = z.array(VocabularySchema).max(10000);

export function normalizeWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

export function shardKey(word: string): string {
  return word.slice(0, 2).padEnd(2, "_").replace(/['-]/g, "_");
}
