import { BackupSchema } from "./backup-schema";
import { configLS } from "../config/persistence";
import { applyConfig } from "../config/lifecycle";
import {
  __nonReactive as themes,
  saveCustomThemes,
} from "../collections/custom-themes";
import { favoriteQuotes } from "./favorite-quotes";
import { readResults, importResults } from "./storage";
import { LocalResult } from "./results";

export async function exportBackup(): Promise<string> {
  return JSON.stringify(
    BackupSchema.parse({
      application: "monkeytype-local-practice",
      version: 1,
      exportedAt: Date.now(),
      results: await readResults(),
      preferences: {
        config: configLS.get(),
        customThemes: themes.getCustomThemes(),
        favoriteQuotes: favoriteQuotes.get(),
      },
    }),
    null,
    2,
  );
}

/** Validate the entire file before changing results or preferences. */
export async function importBackup(json: string): Promise<{
  results: LocalResult[];
  imported: number;
  skipped: number;
  preferencesError?: string;
}> {
  if (json.length > 50 * 1024 * 1024) throw new Error("Backup exceeds 50 MB.");
  const { preferences, ...resultsBackup } = BackupSchema.parse(
    JSON.parse(json) as unknown,
  );
  const outcome = await importResults(JSON.stringify(resultsBackup));
  let preferencesError: string | undefined;
  if (preferences !== undefined) {
    try {
      await saveCustomThemes(preferences.customThemes);
      if (!favoriteQuotes.set(preferences.favoriteQuotes)) {
        throw new Error("Unable to save favorite quotes.");
      }
      if (!configLS.set(preferences.config)) {
        throw new Error("Unable to save settings.");
      }
      await applyConfig(preferences.config);
    } catch (error) {
      // Results are already committed. State this explicitly so retrying is safe.
      preferencesError =
        error instanceof Error
          ? error.message
          : "Unable to restore preferences.";
    }
  }
  return {
    ...outcome,
    skipped: resultsBackup.results.length - outcome.imported,
    ...(preferencesError === undefined ? {} : { preferencesError }),
  };
}
