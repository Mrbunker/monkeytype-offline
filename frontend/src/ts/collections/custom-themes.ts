import { CustomTheme, CustomThemeSchema } from "@monkeytype/schemas/users";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection, useLiveQuery } from "@tanstack/solid-db";
import { z } from "zod";
import { queryClient } from "../queries";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";

export type CustomThemeItem = CustomTheme;
const storage = new LocalStorageWithSchema({
  key: "monkeytype-local-themes",
  schema: z.array(CustomThemeSchema),
  fallback: [],
});
const collection = createCollection(
  queryCollectionOptions({
    queryKey: ["local", "customThemes"],
    queryClient,
    staleTime: Infinity,
    gcTime: Infinity,
    startSync: true,
    getKey: (theme) => theme._id,
    queryFn: async () => storage.get(),
  }),
);

// oxlint-disable-next-line typescript/explicit-function-return-type
export function useCustomThemesLiveQuery() {
  return useLiveQuery((q) =>
    q.from({ theme: collection }).orderBy(({ theme }) => theme.name, "asc"),
  );
}

export async function saveCustomThemes(themes: CustomTheme[]): Promise<void> {
  if (!storage.set(themes)) {
    throw new Error("Unable to save custom themes locally");
  }
  await collection.utils.refetch();
}

export async function addCustomTheme(
  theme: Pick<CustomTheme, "name" | "colors">,
): Promise<void> {
  await saveCustomThemes([
    ...storage.get(),
    { ...theme, _id: crypto.randomUUID() },
  ]);
}

export async function editCustomTheme(
  theme: Pick<CustomTheme, "name" | "colors"> & { themeId: string },
): Promise<void> {
  await saveCustomThemes(
    storage
      .get()
      .map((item) =>
        item._id === theme.themeId
          ? { _id: item._id, name: theme.name, colors: theme.colors }
          : item,
      ),
  );
}

export async function deleteCustomTheme({
  themeId,
}: {
  themeId: string;
}): Promise<void> {
  await saveCustomThemes(
    storage.get().filter((theme) => theme._id !== themeId),
  );
}

export const __nonReactive = {
  getCustomThemes: (): CustomTheme[] => storage.get(),
  getCustomTheme: (id: string): CustomTheme | undefined =>
    storage.get().find((theme) => theme._id === id),
};
