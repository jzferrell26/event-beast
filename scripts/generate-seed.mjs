import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("src/lib/demo.ts", "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { demoGuide } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const q = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Invalid numeric seed value"); return String(value); }
  if (Array.isArray(value)) return `ARRAY[${value.map(q).join(",")}]::text[]`;
  return `'${String(value).replaceAll("'", "''")}'`;
};
const insert = (table, rows) => rows.length ? rows.map((row) => {
  const columns = Object.keys(row);
  if (![table, ...columns].every((name) => /^[a-z_]+$/.test(name))) throw new Error("Invalid seed identifier");
  return `insert into public.${table} (${columns.join(", ")}) values (${columns.map((key) => q(row[key])).join(", ")}) on conflict do nothing;`;
}).join("\n") : "";
const sections = [
  ["events", [demoGuide.event]], ["event_settings", [demoGuide.settings]], ["sponsor_tiers", demoGuide.tiers],
  ["sponsors", demoGuide.sponsors], ["agenda_days", demoGuide.days], ["speakers", demoGuide.speakers],
  ["agenda_sessions", demoGuide.sessions], ["session_speakers", demoGuide.sessionSpeakers],
  ["agenda_sponsor_placements", demoGuide.placements], ["lunch_locations", demoGuide.lunches],
  ["venue_locations", demoGuide.venues], ["announcements", demoGuide.announcements],
];
await writeFile("supabase/seed.sql", "-- EXPLICIT DEMO DATA ONLY. Dates, speakers, locations and most sponsors are samples.\n-- No real attendee registrations or authentication accounts are created.\n-- Never apply this sample program as confirmed production event content.\nbegin;\n\n" + sections.map(([table, rows]) => insert(table, rows)).filter(Boolean).join("\n\n") + "\n\ncommit;\n");
console.log("Generated explicit public demo seed. No attendee or auth records included.");
