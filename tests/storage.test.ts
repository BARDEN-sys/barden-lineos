import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/allocation";
import { demoJob } from "@/lib/job";
import { currentJobId, deleteJob, listJobs, loadJob, saveJob } from "@/lib/storage";
import type { Job, Photo } from "@/lib/types";

const photo = (job: Job, id: string, text: string): Photo => {
  const blob = new Blob([text], { type: "image/jpeg" });
  return { id, jobId: job.id, sheetId: job.sheets[1].id, kind: "markup", blob, url: "blob:x", width: 10, height: 10, takenAt: "2026-09-29T12:00:00Z", createdBy: "u" };
};

describe("on-phone storage", () => {
  it("saves and reloads a job with its print, marks, daily rows and photos", async () => {
    const job = await demoJob();
    job.master[0].taskCode = "TC-1010";
    job.sheets[4].taskCodes = { S16A: "TC-GOLF" };
    job.daily = [{ id: "d1", jobId: job.id, day: "2026-09-29", sheetId: job.sheets[1].id, unitCode: "S10B", taskCode: "TC-1010", qty: 100, createdBy: "u", createdAt: "2026-09-29T12:00:00Z" }];
    job.photos = [photo(job, "p1", "photo-one")];
    await saveJob(job);

    const back = (await loadJob(job.id))!;
    expect(back.header).toEqual(job.header);
    expect(back.marks).toEqual(job.marks);
    expect(back.daily).toEqual(job.daily);
    expect(back.master[0].taskCode).toBe("TC-1010");
    expect(back.sheets[4].taskCodes).toEqual({ S16A: "TC-GOLF" });
    expect(Array.from(back.pdfBytes!)).toEqual(Array.from(job.pdfBytes!));
    expect(back.photos).toHaveLength(1);
    expect(await back.photos[0].blob.text()).toBe("photo-one");
    // Same allocation after the round trip.
    expect(allocate(back)).toEqual(allocate(job));
    expect(await currentJobId()).toBe(job.id);
  });

  it("adds and removes photos on later saves", async () => {
    const job = await demoJob();
    job.photos = [photo(job, "a", "A"), photo(job, "b", "B")];
    await saveJob(job);
    job.photos = [job.photos[1], photo(job, "c", "C")];
    await saveJob(job);
    const back = (await loadJob(job.id))!;
    expect(await Promise.all(back.photos.map((p) => p.blob.text()))).toEqual(["B", "C"]);
  });

  it("lists saved jobs newest first and deletes them", async () => {
    const a = await demoJob();
    await saveJob(a);
    const b = await demoJob();
    b.marks = b.marks.slice(0, 3);
    await saveJob(b);
    const list = await listJobs();
    expect(list[0]).toMatchObject({ id: b.id, woNumber: "4222352", marks: 3, sheets: 5 });
    await deleteJob(b.id);
    expect(await loadJob(b.id)).toBeNull();
    expect((await listJobs()).some((j) => j.id === b.id)).toBe(false);
    expect(await currentJobId()).toBeNull();
  });
});
