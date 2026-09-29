import { ConfigSchema } from "@monkeytype/schemas/configs";
import { CustomThemeSchema } from "@monkeytype/schemas/users";
import { z } from "zod";
import { ResultsBackupSchema } from "./storage";

export const BackupSchema = ResultsBackupSchema.extend({
  preferences: z
    .object({
      config: ConfigSchema,
      customThemes: z.array(CustomThemeSchema).max(1000),
      favoriteQuotes: z.record(z.string(), z.array(z.string().regex(/^\d+$/))),
    })
    .strict()
    .optional(),
}).strict();
