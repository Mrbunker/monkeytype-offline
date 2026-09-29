import { z } from "zod";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

export const favoriteQuotes = new LocalStorageWithSchema({
  key: "monkeytype-local-favorite-quotes",
  schema: z.record(z.string(), z.array(z.string().regex(/^\d+$/))),
  fallback: {},
});
