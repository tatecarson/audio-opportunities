/**
 * Airtable data layer.
 *
 * Fetches the "Audio Directory" base at BUILD TIME via the Airtable REST API.
 * Credentials come from environment variables (see .env.example):
 *   - AIRTABLE_TOKEN    Personal Access Token (scopes: data.records:read)
 *   - AIRTABLE_BASE_ID  Base id (starts with "app")
 *
 * RULE: a record is only included if its "Last Verified" field has a date.
 */

import { readFileSync } from "node:fs";

// Read from import.meta.env (Vite loads .env files locally) AND process.env
// (CI/host env vars, e.g. Netlify, which Vite does not surface on import.meta.env).
const TOKEN =
  (import.meta.env.AIRTABLE_TOKEN as string | undefined) ?? process.env.AIRTABLE_TOKEN;
const BASE_ID =
  (import.meta.env.AIRTABLE_BASE_ID as string | undefined) ??
  process.env.AIRTABLE_BASE_ID ??
  "appyqRTTdm4p0Ze0P";

const API = "https://api.airtable.com/v0";

/**
 * Offline dev fallback. The live API is the source of truth; when no token is
 * configured we read a locally-generated snapshot (src/data/snapshot.json, git
 * ignored) so the UI still renders during local development / CI without secrets.
 */
function loadSnapshot(table: string): AirtableRecord[] {
  const url = new URL("../data/snapshot.json", import.meta.url);
  const snap = JSON.parse(readFileSync(url, "utf-8")) as Record<string, AirtableRecord[]>;
  const rows = snap[table];
  if (!rows) throw new Error(`Snapshot has no table "${table}".`);
  return rows;
}

/** A select option ({id,name,color}) collapsed to its display name. */
function names(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : (v as { name?: string })?.name ?? ""))
      .filter(Boolean);
  }
  if (typeof value === "object") return [(value as { name?: string }).name ?? ""].filter(Boolean);
  return [String(value)];
}

function name(value: unknown): string {
  return names(value)[0] ?? "";
}

/** Initials for the avatar tile, e.g. "Dolby Laboratories" -> "DB". */
function initials(label: string): string {
  const words = label.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

/** Page through every record in a table. Throws a helpful error if creds are missing. */
async function fetchTable(table: string): Promise<AirtableRecord[]> {
  if (!TOKEN) {
    try {
      return loadSnapshot(table);
    } catch {
      throw new Error(
        "Missing AIRTABLE_TOKEN and no local snapshot found. Copy .env.example to .env and add your Airtable Personal Access Token. See README.md.",
      );
    }
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${API}/${BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    // Only fetch verified records; we double-check in code as well.
    url.searchParams.set("filterByFormula", "NOT({Last Verified} = '')");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${table} request failed: ${res.status} ${res.statusText}\n${body}`);
    }

    const data = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

export interface Employer {
  id: string;
  name: string;
  initials: string;
  sectors: string[];
  headquarters: string;
  geography: string[];
  size: string;
  internship: string;
  roles: string;
  careerUrl: string;
  handshake: string;
  notes: string;
  lastVerified: string;
}

export interface Program {
  id: string;
  name: string;
  initials: string;
  institution: string;
  location: string;
  degree: string;
  specializations: string[];
  duration: string;
  funding: string;
  deadline: string;
  regions: string[];
  url: string;
  notes: string;
  lastVerified: string;
}

export interface Facet {
  label: string;
  value: string;
  count: number;
}

/** Build facet buckets (value -> count) from a list of multi/single-valued fields. */
function buildFacet(rows: { [k: string]: unknown }[], key: string): Facet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const vals = Array.isArray(row[key]) ? (row[key] as string[]) : [row[key] as string];
    for (const v of vals) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ label: value, value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function getEmployers(): Promise<{
  employers: Employer[];
  facets: { sector: Facet[]; size: Facet[]; geography: Facet[] };
}> {
  const records = await fetchTable("Employers");

  const employers: Employer[] = records
    .filter((r) => name(r.fields["Last Verified"]))
    .map((r) => {
      const f = r.fields;
      const nm = name(f["Name"]) || "Untitled";
      return {
        id: r.id,
        name: nm,
        initials: initials(nm),
        sectors: names(f["Sector"]),
        headquarters: name(f["Headquarters"]),
        geography: names(f["Hiring Geography"]),
        size: name(f["Company Size"]),
        internship: name(f["Internship Program"]),
        roles: name(f["Entry-Level Roles"]),
        careerUrl: name(f["Career URL"]),
        handshake: name(f["Handshake Status"]),
        notes: name(f["Notes"]),
        lastVerified: name(f["Last Verified"]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    employers,
    facets: {
      sector: buildFacet(employers, "sectors"),
      size: buildFacet(employers, "size"),
      geography: buildFacet(employers, "geography"),
    },
  };
}

export async function getPrograms(): Promise<{
  programs: Program[];
  facets: { degree: Facet[]; specialization: Facet[]; region: Facet[]; funding: Facet[] };
}> {
  const records = await fetchTable("Graduate Programs");

  const programs: Program[] = records
    .filter((r) => name(r.fields["Last Verified"]))
    .map((r) => {
      const f = r.fields;
      const nm = name(f["Program Name"]) || "Untitled";
      return {
        id: r.id,
        name: nm,
        initials: initials(name(f["Institution"]) || nm),
        institution: name(f["Institution"]),
        location: name(f["Location"]),
        degree: name(f["Degree Type"]),
        specializations: names(f["Specialization"]),
        duration: name(f["Duration"]),
        funding: name(f["Funding"]),
        deadline: name(f["Application Deadline"]),
        regions: names(f["Region"]),
        url: name(f["Program URL"]),
        notes: name(f["Notes"]),
        lastVerified: name(f["Last Verified"]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    programs,
    facets: {
      degree: buildFacet(programs, "degree"),
      specialization: buildFacet(programs, "specializations"),
      region: buildFacet(programs, "regions"),
      funding: buildFacet(programs, "funding"),
    },
  };
}
