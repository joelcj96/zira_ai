import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetExternalJobFeedCacheForTests,
  getExternalJobFeedSyncStatus,
  getLatestExternalFeedJobs
} from "../services/externalJobFeedService.js";

const originalFetch = global.fetch;
const originalDisableFeed = process.env.DISABLE_REAL_JOB_FEED;

describe("externalJobFeedService", () => {
  beforeEach(() => {
    __resetExternalJobFeedCacheForTests();
    process.env.DISABLE_REAL_JOB_FEED = "false";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalDisableFeed === undefined) {
      delete process.env.DISABLE_REAL_JOB_FEED;
    } else {
      process.env.DISABLE_REAL_JOB_FEED = originalDisableFeed;
    }
  });

  it("normalizes jobs from multiple real providers into the shared feed shape", async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).startsWith("https://remotive.com/")) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            jobs: [
              {
                id: 2088698,
                url: "https://remotive.com/remote-jobs/software-development/example-2088698",
                title: "Senior Platform Engineer",
                company_name: "Acme Labs",
                tags: ["Node.js", "React", "AWS"],
                job_type: "full_time",
                publication_date: "2026-04-02T11:46:16",
                candidate_required_location: "Worldwide",
                salary: "$130k - $150k",
                description: "<p>Build resilient distributed systems.</p>"
              }
            ]
          })
        });
      }

      if (String(url).startsWith("https://www.arbeitnow.com/")) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: [
              {
                slug: "senior-node-engineer-berlin-123",
                title: "Senior Node Engineer",
                company_name: "Berlin Tech",
                description: "<p>Build APIs for distributed services.</p>",
                remote: true,
                url: "https://www.arbeitnow.com/jobs/companies/berlin-tech/senior-node-engineer-berlin-123",
                tags: ["Node.js", "TypeScript"],
                job_types: ["Full-time permanent"],
                location: "Berlin",
                created_at: 1775230220
              }
            ]
          })
        });
      }

      if (String(url).startsWith("https://www.themuse.com/")) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            results: [
              {
                id: 99881,
                name: "Backend Engineer",
                company: { name: "Muse Corp" },
                locations: [{ name: "Remote" }],
                publication_date: "2026-04-02T09:00:00Z",
                refs: { landing_page: "https://www.themuse.com/jobs/muse-corp/backend-engineer" },
                contents: "<p>Build internal platform services.</p>",
                categories: [{ name: "Software Engineering" }],
                levels: [{ name: "Senior" }],
                type: "Full Time"
              }
            ],
            page: 1,
            page_count: 1,
            total: 1,
            items_per_page: 20
          })
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await getLatestExternalFeedJobs({ force: true });
    const syncStatus = getExternalJobFeedSyncStatus();

    expect(result.fetchedFresh).toBe(true);
    expect(result.jobs).toHaveLength(3);
    expect(result.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "remotive-2088698",
          title: "Senior Platform Engineer",
          company: "Acme Labs",
          location: "Worldwide",
          locationType: "remote",
          jobType: "full-time",
          salary: 150000,
          budgetRange: "high",
          sourceTag: "Feed",
          sourceLink: "https://remotive.com/remote-jobs/software-development/example-2088698",
          skillsRequired: ["Node.js", "React", "AWS"],
          description: "Build resilient distributed systems.",
          externalSourceId: "remotive",
          externalSourceName: "Remotive"
        }),
        expect.objectContaining({
          id: "arbeitnow-senior-node-engineer-berlin-123",
          title: "Senior Node Engineer",
          company: "Berlin Tech",
          location: "Berlin",
          locationType: "remote",
          jobType: "full-time",
          salary: null,
          budgetRange: "low",
          sourceTag: "Feed",
          sourceLink:
            "https://www.arbeitnow.com/jobs/companies/berlin-tech/senior-node-engineer-berlin-123",
          skillsRequired: ["Node.js", "TypeScript"],
          description: "Build APIs for distributed services.",
          externalSourceId: "arbeitnow",
          externalSourceName: "Arbeitnow"
        }),
        expect.objectContaining({
          id: "themuse-99881",
          title: "Backend Engineer",
          company: "Muse Corp",
          location: "Remote",
          locationType: "remote",
          jobType: "full-time",
          salary: null,
          budgetRange: "low",
          sourceTag: "Feed",
          sourceLink: "https://www.themuse.com/jobs/muse-corp/backend-engineer",
          skillsRequired: ["Software Engineering", "Senior"],
          description: "Build internal platform services.",
          externalSourceId: "themuse",
          externalSourceName: "The Muse"
        })
      ])
    );
    expect(syncStatus.enabled).toBe(true);
    expect(syncStatus.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "remotive", status: "success", fetchedJobCount: 1 }),
        expect.objectContaining({ id: "arbeitnow", status: "success", fetchedJobCount: 1 }),
        expect.objectContaining({ id: "themuse", status: "success", fetchedJobCount: 1 })
      ])
    );
  });

  it("reuses cached jobs inside the sync interval", async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).startsWith("https://remotive.com/")) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            jobs: [
              {
                id: 1,
                url: "https://remotive.com/job/1",
                title: "Cached Job",
                company_name: "Cache Corp",
                tags: [],
                job_type: "contract",
                publication_date: "2026-04-01T10:00:00",
                candidate_required_location: "USA",
                salary: "$90k",
                description: "Role"
              }
            ]
          })
        });
      }

      if (String(url).startsWith("https://www.themuse.com/")) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ results: [], page: 1, page_count: 1 })
        });
      }

      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] })
      });
    });

    const first = await getLatestExternalFeedJobs({ force: true });
    const second = await getLatestExternalFeedJobs();

    expect(first.jobs).toHaveLength(1);
    expect(second.jobs).toHaveLength(1);
    expect(second.fetchedFresh).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it("falls back to cached jobs when all providers later fail", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          jobs: [
            {
              id: 2,
              url: "https://remotive.com/job/2",
              title: "Stable Job",
              company_name: "Stable Corp",
              tags: ["Python"],
              job_type: "full_time",
              publication_date: "2026-04-01T10:00:00",
              candidate_required_location: "Remote",
              salary: "$110k",
              description: "<p>Stable role</p>"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              slug: "stable-ops-role-123",
              title: "Stable Ops Role",
              company_name: "Ops Corp",
              description: "<p>Operations role</p>",
              remote: false,
              url: "https://www.arbeitnow.com/jobs/companies/ops-corp/stable-ops-role-123",
              tags: ["Operations"],
              job_types: ["Full-time permanent"],
              location: "Munich",
              created_at: 1775230220
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              id: 112233,
              name: "Stable Data Engineer",
              company: { name: "Data Works" },
              locations: [{ name: "Remote" }],
              publication_date: "2026-04-01T09:00:00Z",
              refs: { landing_page: "https://www.themuse.com/jobs/data-works/stable-data-engineer" },
              contents: "<p>Data platform role</p>",
              categories: [{ name: "Data" }],
              levels: [{ name: "Mid Level" }],
              type: "Full Time"
            }
          ],
          page: 1,
          page_count: 1,
          total: 1,
          items_per_page: 20
        })
      })
      .mockRejectedValueOnce(new Error("remotive down"))
      .mockRejectedValueOnce(new Error("arbeitnow down"))
      .mockRejectedValueOnce(new Error("themuse down"));

    const fresh = await getLatestExternalFeedJobs({ force: true });
    const fallback = await getLatestExternalFeedJobs({ force: true });

    expect(fresh.jobs).toHaveLength(3);
    expect(fallback.jobs).toHaveLength(3);
    expect(fallback.fetchedFresh).toBe(false);
    expect(fallback.source).toBe("stale-cache");
    expect(fallback.jobs.map((job) => job.title)).toEqual(
      expect.arrayContaining(["Stable Job", "Stable Ops Role", "Stable Data Engineer"])
    );
    expect(fallback.syncStatus.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "remotive", status: "error" }),
        expect.objectContaining({ id: "arbeitnow", status: "error" }),
        expect.objectContaining({ id: "themuse", status: "error" })
      ])
    );
  });
});