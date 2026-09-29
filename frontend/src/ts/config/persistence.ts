import { Config as ConfigSchema } from "@monkeytype/schemas/configs";
import * as ConfigSchemas from "@monkeytype/schemas/configs";
import { Config } from "./store";
import { getDefaultConfig } from "../constants/default-config";
import { migrateConfig } from "./utils";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import { isObject } from "../utils/misc";

export const configLS = new LocalStorageWithSchema({
  key: "monkeytype-local-config",
  schema: ConfigSchemas.ConfigSchema,
  fallback: getDefaultConfig(),
  migrate: (value) =>
    isObject(value) ? migrateConfig(value) : getDefaultConfig(),
});

export function saveToLocalStorage(
  _key: keyof ConfigSchema,
  nosave = false,
  _noDbCheck = false,
): void {
  if (!nosave) configLS.set(Config);
}

export function saveFullConfigToLocalStorage(_noDbCheck = false): void {
  configLS.set(Config);
}
