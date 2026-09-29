import { openDB, DBSchema, IDBPDatabase } from "idb";
import { createSignal } from "solid-js";

type FileDB = DBSchema & {
  files: {
    key: string; // filename
    value: string; // the data url
  };
};

type Filename = "LocalBackgroundFile" | "LocalFontFamilyFile";

class FileStorage {
  private dbPromise?: Promise<IDBPDatabase<FileDB>>;
  private dbName: string;
  private signals = new Map<
    Filename,
    [get: () => number, set: (v: number | ((prev: number) => number)) => void]
  >();

  constructor(dbName = "file-storage-db") {
    this.dbName = dbName;
  }

  private async database(): Promise<IDBPDatabase<FileDB>> {
    this.dbPromise ??= openDB<FileDB>(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files");
        }
      },
    }).catch((error: unknown) => {
      this.dbPromise = undefined;
      throw error;
    });
    return this.dbPromise;
  }

  private getSignal(
    filename: Filename,
  ): [
    get: () => number,
    set: (v: number | ((prev: number) => number)) => void,
  ] {
    let signal = this.signals.get(filename);
    if (!signal) {
      signal = createSignal(0);
      this.signals.set(filename, signal);
    }
    return signal;
  }

  private notify(filename: Filename): void {
    const signal = this.signals.get(filename);
    if (signal) {
      signal[1]((v) => v + 1);
    }
  }

  /** Subscribe to changes for a filename. Call within a reactive context. Returns a version number. */
  track(filename: Filename): number {
    return this.getSignal(filename)[0]();
  }

  async storeFile(filename: Filename, dataUrl: string): Promise<void> {
    const db = await this.database();
    await db.put("files", dataUrl, filename);
    this.notify(filename);
  }

  async getFile(filename: Filename): Promise<string | undefined> {
    try {
      const db = await this.database();
      return await db.get("files", filename);
    } catch {
      // Optional uploaded assets must not prevent typing when storage is disabled.
      return undefined;
    }
  }

  async deleteFile(filename: Filename): Promise<void> {
    const db = await this.database();
    await db.delete("files", filename);
    this.notify(filename);
  }

  async listFilenames(): Promise<Filename[]> {
    const db = await this.database();
    return db.getAllKeys("files") as Promise<Filename[]>;
  }

  async hasFile(filename: Filename): Promise<boolean> {
    return (await this.getFile(filename)) !== undefined;
  }
}

export default new FileStorage();
