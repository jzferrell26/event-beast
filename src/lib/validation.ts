import { z } from "zod";
import Papa from "papaparse";

export const uuid = z.string().uuid();
export const secureUrl = z.union([z.literal(""), z.url().refine((s) => s.startsWith("https://"), "Use an HTTPS link")]);
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Your name is required").max(120),
  company: z.string().trim().max(120), title: z.string().trim().max(120),
  city: z.string().trim().max(80), state: z.string().trim().max(80), bio: z.string().trim().max(1000),
  interests: z.array(z.string().trim().min(1).max(60)).max(12),
  directory_visible: z.boolean(), messaging_available: z.boolean(), headshot_path: z.string().max(500).nullable().optional(),
}).strict();
export const messageSchema = z.object({ client_id: uuid, body: z.string().trim().min(1, "Write a message first").max(4000, "Keep messages under 4,000 characters") }).strict();
export const importRowSchema = z.object({ email: z.string().trim().pipe(z.email().max(254)).transform((s) => s.toLowerCase()), name: z.string().trim().min(1).max(120), phone: z.string().trim().max(40).optional() }).strict();
export interface ImportRow { email: string; name: string; phone?: string }
export interface ImportIssue { row: number; message: string }

export interface ImportAnalysis { rows: ImportRow[]; errors: ImportIssue[]; warnings: string[]; columns: string[] }
export interface ImportSummary { processed: number; new: number; existing: number; claimed: number; disabled: number; pending: number; privileged: number; preview_token: string; mode: 'add_missing_only'; emails_sent: 0 }
export interface ImportPreview extends ImportAnalysis { committed: false; demo?: boolean; summary?: ImportSummary }
const importHeaders: Record<string,string> = { email:'email',emailaddress:'email',name:'name',fullname:'name',firstname:'first_name',lastname:'last_name',phone:'phone',phonenumber:'phone',mobilephone:'phone' };

export function parseAttendeeCsv(csv: string): ImportAnalysis {
  if (new TextEncoder().encode(csv).byteLength > 1024 * 1024) return { rows: [], warnings: [], columns: [], errors: [{ row: 0, message: "CSV must be smaller than 1 MB" }] };
  const result = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => { const clean=h.trim().toLowerCase(); return importHeaders[clean.replace(/[ _-]/g,'')] ?? clean; },
  });
  const errors: ImportIssue[] = result.errors.map((e) => ({ row: (e.row ?? 0) + 2, message: e.message }));
  const headers = result.meta.fields ?? [];
  if (!headers.includes("email") || (!headers.includes("name") && !headers.includes('first_name'))) errors.push({ row: 1, message: "CSV needs email and name columns, or email with first name and optional last name" });
  if (new Set(headers).size !== headers.length || Object.keys(result.meta.renamedHeaders ?? {}).length > 0) errors.push({ row: 1, message: "Column headers must be unique" });
  if (result.data.length < 1 || result.data.length > 1000) errors.push({ row: 0, message: "Import 1 to 1,000 attendees at a time" });
  const rows: ImportRow[] = [];
  const warnings: string[] = [];
  const ignored=headers.filter(h=>!['email','name','first_name','last_name','phone'].includes(h));
  if (ignored.length) warnings.push(`Ignored columns: ${ignored.join(', ')}. Roles, permissions and profile information are never taken from a roster file.`);
  if (headers.includes('name') && (headers.includes('first_name')||headers.includes('last_name'))) warnings.push('The name column is used; separate first/last name columns are ignored.');
  const seen = new Set<string>();
  result.data.forEach((row, index) => {
    const name=headers.includes('name')?row.name:[row.first_name,row.last_name].filter(Boolean).map(s=>s.trim()).join(' ');
    const parsed = importRowSchema.safeParse({ email: row.email?.trim().toLowerCase(), name, ...(row.phone !== undefined ? { phone: row.phone } : {}) });
    if (!parsed.success) { errors.push({ row: index + 2, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }); return; }
    if (seen.has(parsed.data.email)) errors.push({ row: index + 2, message: "Duplicate email in this file" });
    seen.add(parsed.data.email); rows.push(parsed.data);
  });
  return { rows, errors, warnings, columns: headers.filter(h=>['email','name','first_name','last_name','phone'].includes(h)) };
}
