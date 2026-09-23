import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Real PostgreSQL execution, with only Supabase-managed auth/storage/realtime
// schemas shimmed. This does not pretend to test the hosted Realtime transport.
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, delete on storage.objects to anon, authenticated;
    create schema realtime;
    create table realtime.messages(extension text, topic text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as
      $$ select current_setting('realtime.topic', true) $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
      language sql as $$ insert into realtime.messages values ('broadcast', topic, payload, event, private) $$;
  `);
  const migrationDir = path.resolve("supabase/migrations");
  for (const file of (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(migrationDir, file), "utf8"));
  }
  return db;
}

export async function asUser<T>(db: PGlite, user: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export const ids = {
  event: "10000000-0000-4000-8000-000000000001",
  otherEvent: "10000000-0000-4000-8000-000000000002",
  alice: "20000000-0000-4000-8000-000000000001",
  bob: "20000000-0000-4000-8000-000000000002",
  outsider: "20000000-0000-4000-8000-000000000003",
  admin: "20000000-0000-4000-8000-000000000004",
  unverified: "20000000-0000-4000-8000-000000000005",
  aliceAttendee: "30000000-0000-4000-8000-000000000001",
  bobAttendee: "30000000-0000-4000-8000-000000000002",
  thirdAttendee: "30000000-0000-4000-8000-000000000003",
  foreignAttendee: "30000000-0000-4000-8000-000000000004",
  day: "40000000-0000-4000-8000-000000000001",
  otherDay: "40000000-0000-4000-8000-000000000002",
  session: "50000000-0000-4000-8000-000000000001",
  sponsor: "60000000-0000-4000-8000-000000000001",
};

export async function seedSecurityFixture(db: PGlite) {
  await db.query(`insert into public.events(id,slug,name,published) values
    ($1,'security-test','Security test',true),($2,'second-event','Other event',false)`, [ids.event, ids.otherEvent]);
  await db.query("insert into public.event_settings(event_id) values ($1),($2)", [ids.event, ids.otherEvent]);
  for (const [user, email, verified] of [
    [ids.alice, "alice@example.test", true], [ids.bob, "bob@example.test", true],
    [ids.outsider, "outsider@example.test", true], [ids.admin, "admin@example.test", true],
    [ids.unverified, "unverified@example.test", false],
  ] as const) {
    await db.query("insert into auth.users values ($1,$2,$3)", [user, email, verified ? new Date().toISOString() : null]);
  }
  await db.query("insert into public.event_admins(event_id,user_id,role) values ($1,$2,'owner')", [ids.event, ids.admin]);
  for (const [attendee, event, email, name] of [
    [ids.aliceAttendee, ids.event, "alice@example.test", "Alice Sample"],
    [ids.bobAttendee, ids.event, "bob@example.test", "Bob Sample"],
    [ids.thirdAttendee, ids.event, "unverified@example.test", "Unverified Sample"],
    [ids.foreignAttendee, ids.otherEvent, "alice@example.test", "Alice other event"],
  ]) {
    await db.query("insert into public.attendees(id,event_id,registration_email,registration_name) values ($1,$2,$3,$4)", [attendee, event, email, name]);
  }
  for (const user of [ids.alice, ids.bob]) {
    await asUser(db, user, () => db.query("select public.claim_attendee($1)", [ids.event]));
  }
  await db.query("insert into public.agenda_days(id,event_id,label,date,published) values ($1,$2,'Day 1','2026-10-08',true),($3,$2,'Day 2','2026-10-09',true)", [ids.day, ids.event, ids.otherDay]);
  await db.query("insert into public.agenda_sessions(id,event_id,day_id,title,starts_at,ends_at,published) values ($1,$2,$3,'Sample session','2026-10-08T14:00:00Z','2026-10-08T15:00:00Z',true)", [ids.session, ids.event, ids.day]);
  await db.query("insert into public.sponsors(id,event_id,name,published) values ($1,$2,'Sample sponsor',true)", [ids.sponsor, ids.event]);
}
