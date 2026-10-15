import type { Job, Photo } from "./types";

// On-phone storage (IndexedDB) so a job survives closing the app, a reload or a dead
// battery, with or without signal. M4 adds the upload queue on top of this.
//
// Stores: jobs (job record, no big binaries), pdfs (print bytes by job id),
// photos (photo bytes as ArrayBuffer — Safari has been unreliable storing Blobs), meta.

const DB_NAME = "barden-lineos";
const DB_VERSION = 1;

type StoredPhoto = { id: string; jobId: string; type: string; data: ArrayBuffer };
type PhotoMeta = Omit<Photo, "blob" | "url">;
export type StoredJob = Omit<Job, "pdfBytes" | "photos"> & { photos: PhotoMeta[]; savedAt: string };

export type JobSummary = {
  id: string;
  woNumber: string;
  projectNumber: string;
  pdfName: string;
  sheets: number;
  marks: number;
  dailyRows: number;
  photos: number;
  savedAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pdfs")) db.createObjectStore("pdfs");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" }).createIndex("jobId", "jobId");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

const done = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Save was cancelled"));
  });

function toRecord(job: Job): StoredJob {
  const { pdfBytes: _pdf, photos, ...rest } = job;
  return {
    ...rest,
    photos: photos.map(({ blob: _b, url: _u, ...meta }) => meta),
    savedAt: new Date().toISOString(),
  };
}

/** Save the whole job. Binaries (print PDF, photos) are only written when new. */
export async function saveJob(job: Job): Promise<void> {
  const db = await openDb();
  // What is already stored, read before the write transaction (IDB transactions
  // close if they wait on anything that is not an IDB request).
  const read = db.transaction(["pdfs", "photos"], "readonly");
  const [hasPdf, storedPhotoIds] = await Promise.all([
    done(read.objectStore("pdfs").getKey(job.id)),
    done(read.objectStore("photos").index("jobId").getAllKeys(job.id)),
  ]);
  const stored = new Set(storedPhotoIds as string[]);
  const current = new Set(job.photos.map((p) => p.id));
  const newPhotos: StoredPhoto[] = await Promise.all(
    job.photos
      .filter((p) => !stored.has(p.id))
      .map(async (p) => ({ id: p.id, jobId: job.id, type: p.blob.type || "image/jpeg", data: await p.blob.arrayBuffer() })),
  );

  const tx = db.transaction(["jobs", "pdfs", "photos", "meta"], "readwrite");
  tx.objectStore("jobs").put(toRecord(job));
  if (hasPdf === undefined && job.pdfBytes) tx.objectStore("pdfs").put(job.pdfBytes, job.id);
  for (const p of newPhotos) tx.objectStore("photos").put(p);
  for (const id of stored) if (!current.has(id)) tx.objectStore("photos").delete(id);
  tx.objectStore("meta").put(job.id, "currentJobId");
  await finished(tx);
}

export async function loadJob(id: string): Promise<Job | null> {
  const db = await openDb();
  const tx = db.transaction(["jobs", "pdfs", "photos"], "readonly");
  const [rec, pdf, photos] = await Promise.all([
    done(tx.objectStore("jobs").get(id)) as Promise<StoredJob | undefined>,
    done(tx.objectStore("pdfs").get(id)) as Promise<Uint8Array | undefined>,
    done(tx.objectStore("photos").index("jobId").getAll(id)) as Promise<StoredPhoto[]>,
  ]);
  if (!rec) return null;
  const bytes = new Map(photos.map((p) => [p.id, p]));
  const { savedAt: _s, photos: metas, ...rest } = rec;
  return {
    ...rest,
    // Records saved before a field existed get its default.
    daily: rest.daily ?? [],
    overrides: rest.overrides ?? [],
    pdfBytes: pdf ? new Uint8Array(pdf) : null,
    photos: metas.flatMap((m) => {
      const b = bytes.get(m.id);
      if (!b) return [];
      const blob = new Blob([b.data], { type: b.type });
      return [{ ...m, blob, url: URL.createObjectURL(blob) }];
    }),
  };
}

export async function listJobs(): Promise<JobSummary[]> {
  const db = await openDb();
  const recs = (await done(db.transaction("jobs", "readonly").objectStore("jobs").getAll())) as StoredJob[];
  return recs
    .map((r) => ({
      id: r.id,
      woNumber: r.header.woNumber,
      projectNumber: r.header.projectNumber,
      pdfName: r.pdfName,
      sheets: r.sheets.length,
      marks: r.marks.length,
      dailyRows: (r.daily ?? []).length,
      photos: r.photos.length,
      savedAt: r.savedAt,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function deleteJob(id: string): Promise<void> {
  const db = await openDb();
  const photoIds = (await done(db.transaction("photos", "readonly").objectStore("photos").index("jobId").getAllKeys(id))) as string[];
  const tx = db.transaction(["jobs", "pdfs", "photos", "meta"], "readwrite");
  tx.objectStore("jobs").delete(id);
  tx.objectStore("pdfs").delete(id);
  for (const p of photoIds) tx.objectStore("photos").delete(p);
  const meta = tx.objectStore("meta");
  const cur = meta.get("currentJobId");
  cur.onsuccess = () => {
    if (cur.result === id) meta.delete("currentJobId");
  };
  await finished(tx);
}

export async function currentJobId(): Promise<string | null> {
  const db = await openDb();
  return ((await done(db.transaction("meta", "readonly").objectStore("meta").get("currentJobId"))) as string | undefined) ?? null;
}

/** Ask the browser not to clear this app's data when the phone runs low on space. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
