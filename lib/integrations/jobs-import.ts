import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ExternalJobImportSummary, WorkMode } from "@/lib/types";

export const EXTERNAL_IMPORT_MAX_ITEMS = 200;

export type ExternalImportFormat = "json" | "csv";

export type ExternalListingInput = {
  externalId?: string;
  title?: string;
  company?: string;
  location?: string;
  mode?: string;
  salary?: string;
  meritFit?: number | string;
  evidence?: string;
  tags?: string[] | string;
  sourceUrl?: string;
  applyUrl?: string;
};

export type ParsedExternalImportPayload = {
  source: string;
  format: ExternalImportFormat;
  dryRun: boolean;
  listings: ExternalListingInput[];
};

type ParseResult =
  | { ok: true; value: ParsedExternalImportPayload }
  | { ok: false; error: string };

type NormalizedExternalListing = {
  externalId: string;
  fingerprint: string;
  title: string;
  company: string;
  location: string;
  mode: WorkMode;
  salary: string;
  meritFit: number;
  evidence: string;
  tags: string[];
  sourceUrl: string | null;
  rawPayload: string;
};

const csvTemplate = [
  "external_id,title,company,location,mode,salary,merit_fit,evidence,tags,source_url",
  'ID-1001,Senior Product Designer,Northbeam Health,"Austin, TX",hybrid,$132k-$155k,90,"Portfolio outcomes in healthcare UX","Figma|Design Systems|Accessibility",https://example.com/jobs/ID-1001'
].join("\n");

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeSource(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "external_feed";
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function parseCsvListings(csv: string): ExternalListingInput[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const listings: ExternalListingInput[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? "";
    });

    listings.push({
      externalId: row.external_id || row.id || "",
      title: row.title || "",
      company: row.company || "",
      location: row.location || "",
      mode: row.mode || "",
      salary: row.salary || "",
      meritFit: row.merit_fit || "",
      evidence: row.evidence || "",
      tags: row.tags || "",
      sourceUrl: row.source_url || row.apply_url || ""
    });
  }

  return listings;
}

function normalizeMode(value: string): WorkMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === "remote") return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "onsite" || normalized === "on-site" || normalized === "on site") return "onsite";
  return "remote";
}

function normalizeMerit(value: number | string | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseInt(toString(value), 10);
  if (!Number.isFinite(parsed)) return 75;
  return Math.min(99, Math.max(55, Math.round(parsed)));
}

function normalizeTags(tags: string[] | string | undefined) {
  if (Array.isArray(tags)) {
    const normalized = tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    return normalized.length ? normalized : ["Imported"];
  }

  const source = toString(tags);
  if (!source) return ["Imported"];

  const normalized = source
    .split(/[|,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

  return normalized.length ? normalized : ["Imported"];
}

function buildFingerprint(source: string, input: Omit<NormalizedExternalListing, "fingerprint" | "externalId">) {
  return createHash("sha256")
    .update(
      [
        source,
        input.title.toLowerCase(),
        input.company.toLowerCase(),
        input.location.toLowerCase(),
        input.mode,
        input.salary.toLowerCase(),
        String(input.meritFit),
        input.sourceUrl ?? ""
      ].join("|")
    )
    .digest("hex");
}

function normalizeListing(input: { source: string; raw: ExternalListingInput }): NormalizedExternalListing {
  const title = toString(input.raw.title);
  const company = toString(input.raw.company);
  if (!title || !company) {
    throw new Error("title and company are required");
  }

  const location = toString(input.raw.location) || "US";
  const mode = normalizeMode(toString(input.raw.mode));
  const salary = toString(input.raw.salary) || "Compensation not listed";
  const meritFit = normalizeMerit(input.raw.meritFit);
  const sourceUrl = toString(input.raw.sourceUrl || input.raw.applyUrl) || null;
  const evidence =
    toString(input.raw.evidence) ||
    `Imported from ${input.source}${sourceUrl ? ` (${sourceUrl})` : ""}.`;
  const tags = normalizeTags(input.raw.tags);
  const rawPayload = JSON.stringify(input.raw);

  const base: Omit<NormalizedExternalListing, "fingerprint" | "externalId"> = {
    title,
    company,
    location,
    mode,
    salary,
    meritFit,
    evidence,
    tags,
    sourceUrl,
    rawPayload
  };

  const fingerprint = buildFingerprint(input.source, base);
  const providedExternalId = toString(input.raw.externalId);
  const externalId = providedExternalId || fingerprint;

  return {
    ...base,
    fingerprint,
    externalId
  };
}

export function getExternalImportTemplateCsv() {
  return csvTemplate;
}

export function parseExternalImportPayload(payload: unknown): ParseResult {
  const body = toRecord(payload);
  if (!body) {
    return { ok: false, error: "Invalid payload body." };
  }

  const source = sanitizeSource(toString(body.source));
  const format: ExternalImportFormat = body.format === "csv" ? "csv" : "json";
  const dryRun = body.dryRun === true;

  let listings: ExternalListingInput[] = [];
  if (format === "csv") {
    const csv = toString(body.csv);
    if (!csv) {
      return { ok: false, error: "csv is required when format=csv." };
    }
    listings = parseCsvListings(csv);
  } else if (Array.isArray(body.listings)) {
    listings = body.listings as ExternalListingInput[];
  } else {
    return { ok: false, error: "listings array is required when format=json." };
  }

  if (!listings.length) {
    return { ok: false, error: "No listings found in payload." };
  }

  return {
    ok: true,
    value: {
      source,
      format,
      dryRun,
      listings
    }
  };
}

export async function importExternalJobs(input: {
  source: string;
  format: ExternalImportFormat;
  dryRun?: boolean;
  listings: ExternalListingInput[];
  importedById?: string | null;
}): Promise<ExternalJobImportSummary> {
  const runAt = new Date();
  const source = sanitizeSource(input.source);
  const dryRun = input.dryRun === true;
  const received = input.listings.length;
  const queue = input.listings.slice(0, EXTERNAL_IMPORT_MAX_ITEMS);

  let created = 0;
  let updated = 0;
  let skipped = received - queue.length;
  let failed = 0;
  const errors: string[] = [];

  if (received > EXTERNAL_IMPORT_MAX_ITEMS) {
    errors.push(
      `Import capped at ${EXTERNAL_IMPORT_MAX_ITEMS} listings; ${received - EXTERNAL_IMPORT_MAX_ITEMS} skipped.`
    );
  }

  for (let index = 0; index < queue.length; index += 1) {
    const raw = queue[index];
    let normalized: NormalizedExternalListing;

    try {
      normalized = normalizeListing({ source, raw });
    } catch (error) {
      failed += 1;
      if (errors.length < 25) {
        errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : "Invalid listing."}`);
      }
      continue;
    }

    try {
      const existing = await prisma.externalJobRecord.findUnique({
        where: {
          source_externalId: {
            source,
            externalId: normalized.externalId
          }
        },
        select: {
          id: true,
          jobId: true,
          fingerprint: true
        }
      });

      if (!existing) {
        if (!dryRun) {
          await prisma.$transaction(async (tx) => {
            const job = await tx.job.create({
              data: {
                title: normalized.title,
                company: normalized.company,
                location: normalized.location,
                mode: normalized.mode,
                salary: normalized.salary,
                meritFit: normalized.meritFit,
                evidence: normalized.evidence,
                tags: normalized.tags.join(", "),
                createdById: input.importedById ?? null
              }
            });

            await tx.externalJobRecord.create({
              data: {
                source,
                externalId: normalized.externalId,
                fingerprint: normalized.fingerprint,
                sourceUrl: normalized.sourceUrl,
                rawPayload: normalized.rawPayload,
                importedAt: runAt,
                lastSeenAt: runAt,
                jobId: job.id
              }
            });
          });
        }

        created += 1;
        continue;
      }

      const unchanged = existing.fingerprint === normalized.fingerprint;
      if (!dryRun) {
        if (unchanged) {
          await prisma.externalJobRecord.update({
            where: { id: existing.id },
            data: {
              sourceUrl: normalized.sourceUrl,
              rawPayload: normalized.rawPayload,
              lastSeenAt: runAt
            }
          });
        } else {
          await prisma.$transaction([
            prisma.job.update({
              where: { id: existing.jobId },
              data: {
                title: normalized.title,
                company: normalized.company,
                location: normalized.location,
                mode: normalized.mode,
                salary: normalized.salary,
                meritFit: normalized.meritFit,
                evidence: normalized.evidence,
                tags: normalized.tags.join(", ")
              }
            }),
            prisma.externalJobRecord.update({
              where: { id: existing.id },
              data: {
                fingerprint: normalized.fingerprint,
                sourceUrl: normalized.sourceUrl,
                rawPayload: normalized.rawPayload,
                lastSeenAt: runAt
              }
            })
          ]);
        }
      }

      if (unchanged) {
        skipped += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      if (errors.length < 25) {
        errors.push(
          `Row ${index + 1}: ${error instanceof Error ? error.message : "Import write failed."}`
        );
      }
    }
  }

  return {
    source,
    format: input.format,
    dryRun,
    runAt: runAt.toISOString(),
    received,
    created,
    updated,
    skipped,
    failed,
    errors
  };
}
