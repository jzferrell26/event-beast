import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoGuide } from "../../src/lib/demo";
import { adminDefaults, adminResources, resourceSchema, sessionSpeakerIdsSchema } from "../../src/lib/admin-resources";
import { asUser, createDatabase, ids, seedSecurityFixture } from "../db-harness";

test.use({ serviceWorkers: "block" });
const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || (process.env.EVENT_BEAST_PUBLIC_TESTS === 'true' ? 'http://127.0.0.1:3180' : "http://127.0.0.1:3100")).origin;
const imageFile = { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("synthetic-upload-transport-fixture") };
const respond = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(data) });

async function useFixtureGuide(page: Page) {
  // Exercise the real context refresh, not a production-mode code bypass.
  // Wait for navigation/hydration requests before dispatching a synthetic focus.
  await page.waitForLoadState('networkidle');
  await expect.poll(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    return page.locator(".admin-demo").count();
  }).toBe(0);
}

test("demo upload and session edits remain read-only", async ({ page, request }) => {
  await page.goto("/admin/speakers");
  await page.getByLabel(`Upload photo for ${demoGuide.speakers[0].full_name}`, { exact: true }).setInputFiles(imageFile);
  await expect(page.getByText("Image uploads open when the live event is connected.", { exact: true })).toBeVisible();
  await page.locator(".admin-record-list article").first().getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Upload photo", { exact: true })).toBeAttached();
  await page.keyboard.press("Escape");
  await page.goto("/admin/agenda_sessions");
  await page.locator(".admin-record-list article").first().getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: "Speakers for this session" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("read-only");
  const patch = await request.patch("/api/admin/content/speakers", { headers: { Origin: origin }, data: { id: demoGuide.speakers[0].id, url: "https://assets.example/portrait.webp" } });
  expect(patch.status()).toBe(409);
  expect(patch.headers()["cache-control"]).toContain("no-store");
});

test("operator edits session and speakers together, retries failures, and reloads durable assignments", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const db = await createDatabase();
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(run: () => Promise<T>) => {
    const pending = queue.then(run, run); queue = pending.catch(() => undefined); return pending;
  };
  const first = "70000000-0000-4000-8000-000000000001";
  const second = "70000000-0000-4000-8000-000000000002";
  let failNextSave = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await seedSecurityFixture(db);
    await db.query("insert into public.speakers(id,event_id,full_name,published) values($1,$2,'Ada Speaker',true),($3,$2,'Morgan Panelist',false)", [first, ids.event, second]);
    await db.query("insert into public.session_speakers(event_id,session_id,speaker_id) values($1,$2,$3)", [ids.event, ids.session, first]);
    await db.query("insert into public.agenda_import_notes(event_id,session_id,source_sheet,source_row,issue) values($1,$2,'Day 1',1,'Confirm final time')", [ids.event, ids.session]);
    const guide = { ...structuredClone(demoGuide), mode: "live", event: { ...demoGuide.event, id: ids.event, name: "Operator qualification", timezone: "America/Chicago", is_demo: false } };
    await page.route("**/api/admin/**", async (route) => serial(async () => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/guide") return respond(route, guide);
      if (path === "/api/admin/lookups") return respond(route, {
        agenda_days: [{ id: ids.day, label: "Day 1" }], sponsors: [],
        speakers: [{ id: first, label: "Ada Speaker", published: true }, { id: second, label: "Morgan Panelist", published: false }],
      });
      if (path !== "/api/admin/content/agenda_sessions") return respond(route, { error: "Fixture endpoint unavailable" }, 404);
      try {
        await asUser(db, ids.admin, async () => {
          if (route.request().method() === "POST") {
            if (failNextSave) { failNextSave = false; return respond(route, { error: "Synthetic save failure. Your changes were not saved." }, 503); }
            const body = route.request().postDataJSON();
            const values = resourceSchema(adminResources.agenda_sessions).parse(body.values);
            const speakers = sessionSpeakerIdsSchema.parse(body.speaker_ids);
            const result = await db.query<{ id: string }>("select public.admin_save_agenda_session($1,$2,$3,$4) as id", [ids.event, body.id ?? null, JSON.stringify(values), speakers]);
            return respond(route, { saved: true, record: result.rows[0] });
          }
          const rows = (await db.query<Record<string, unknown>>("select * from public.agenda_sessions where event_id=$1 order by starts_at", [ids.event])).rows;
          const links = (await db.query<{ session_id: string; speaker_id: string }>("select session_id,speaker_id from public.session_speakers where event_id=$1", [ids.event])).rows;
          const notes = (await db.query<{ session_id: string }>("select * from public.agenda_import_notes where event_id=$1", [ids.event])).rows;
          return respond(route, { rows: rows.map((row) => ({ ...row, speaker_ids: links.filter((link) => link.session_id === row.id).map((link) => link.speaker_id), import_note: notes.find((note) => note.session_id === row.id) ?? null })), hasMore: false });
        });
      } catch (error) { return respond(route, { error: error instanceof Error ? error.message : "Fixture error" }, 400); }
    }));
    await page.goto("/admin/agenda_sessions");
    await useFixtureGuide(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Starts at", { exact: false })).toHaveValue("2026-10-08T09:00");
    await expect(dialog.getByRole("checkbox", { name: "Ada Speaker", exact: true })).toBeChecked();
    await expect(dialog.locator(".session-review-notice")).toContainText("Launch readiness");
    await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
    await dialog.getByRole("searchbox", { name: "Find a speaker", exact: true }).fill("Morgan");
    await dialog.getByRole("checkbox", { name: "Morgan Panelist · Draft", exact: true }).check();
    await dialog.getByRole("searchbox", { name: "Find a speaker", exact: true }).fill("");
    await expect(dialog.getByRole("checkbox", { name: "Ada Speaker", exact: true })).not.toBeChecked();
    await dialog.getByLabel("Session title", { exact: false }).fill("Operator revised session");
    await dialog.getByLabel("Starts at", { exact: false }).fill("2026-10-08T09:15");
    await dialog.getByLabel("Ends at", { exact: false }).fill("2026-10-08T09:00");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("End time must be after start time");
    await dialog.getByLabel("Ends at", { exact: false }).fill("2026-10-08T10:15");
    failNextSave = true;
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Synthetic save failure");
    await expect(dialog.getByLabel("Session title", { exact: false })).toHaveValue("Operator revised session");
    await expect(dialog.getByRole("checkbox", { name: "Morgan Panelist · Draft", exact: true })).toBeChecked();
    await dialog.getByRole("group", { name: "Speakers for this session" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("operator-session-form.png") });
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Operator revised session", exact: true })).toBeVisible();
    const durable = await serial(() => db.query("select speaker_id from public.session_speakers where session_id=$1", [ids.session]));
    expect(durable.rows).toEqual([{ speaker_id: second }]);
    const time = await serial(() => db.query<{ starts_at: Date }>("select starts_at from public.agenda_sessions where id=$1", [ids.session]));
    expect(new Date(time.rows[0].starts_at).toISOString()).toBe("2026-10-08T14:15:00.000Z");
    await page.reload(); await useFixtureGuide(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog.getByRole("checkbox", { name: "Morgan Panelist · Draft", exact: true })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Ada Speaker", exact: true })).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: "wait" }); await queue; await db.close(); }
});

for (const resource of ["speakers", "sponsors"] as const) {
  test(`${resource} list saves only the image and form upload stays unsaved until confirmation`, async ({ page }, testInfo) => {
    const field = resource === "speakers" ? "headshot_url" : "logo_url";
    const label = resource === "speakers" ? "Upload photo" : "Upload logo";
    const name = resource === "speakers" ? "Operator Speaker" : "Operator Sponsor";
    const id = "70000000-0000-4000-8000-000000000010";
    const original = "https://assets.example/original.webp";
    const replacement = "https://assets.example/replacement.webp";
    const formReplacement = "https://assets.example/form-replacement.webp";
    let row: Record<string, unknown> = { ...adminDefaults(adminResources[resource]), id, [resource === "speakers" ? "full_name" : "name"]: name, [field]: original, published: true };
    let uploaded = 0; let patched = 0; let saved = 0; let failUpload = true;
    const guide = { ...structuredClone(demoGuide), mode: "live" };
    await page.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/guide") return respond(route, guide);
      if (path === "/api/admin/lookups") return respond(route, { sponsor_tiers: [] });
      if (path !== `/api/admin/content/${resource}`) return respond(route, { error: "Fixture endpoint unavailable" }, 404);
      if (route.request().method() === "PATCH") {
        patched += 1;
        const body = route.request().postDataJSON();
        expect(body).toEqual({ id, url: replacement });
        row = { ...row, [field]: body.url };
        return respond(route, { saved: true, record: { id } });
      }
      if (route.request().method() === "POST") {
        saved += 1; row = { ...row, ...route.request().postDataJSON().values };
        return respond(route, { saved: true, record: { id } });
      }
      return respond(route, { rows: [row], hasMore: false });
    });
    await page.route("**/api/uploads", async (route) => {
      uploaded += 1;
      if (failUpload) { failUpload = false; return respond(route, { error: "This image could not be read. Please try a different JPG, PNG or WebP." }, 400); }
      return respond(route, { url: uploaded > 2 ? formReplacement : replacement });
    });
    await page.goto(`/admin/${resource}`); await useFixtureGuide(page);
    const input = page.getByLabel(`${label} for ${name}`, { exact: true });
    await input.setInputFiles(imageFile);
    await expect(page.locator("#admin-main").getByRole("alert")).toContainText("could not be read");
    expect(row[field]).toBe(original); expect(patched).toBe(0);
    await input.setInputFiles(imageFile);
    await expect.poll(() => patched).toBe(1);
    expect(row[field]).toBe(replacement); expect(saved).toBe(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(`input[type="url"]`).first()).toHaveValue(replacement);
    await dialog.getByLabel(label, { exact: true }).setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("not an image") });
    await expect(dialog.getByRole("alert")).toContainText("3 MB"); expect(uploaded).toBe(2);
    await dialog.getByLabel(label, { exact: true }).setInputFiles(imageFile);
    await expect(dialog.locator('input[type="url"]').first()).toHaveValue(formReplacement);
    expect(uploaded).toBe(3); expect(saved).toBe(0); expect(row[field]).toBe(replacement);
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(saved).toBe(1); expect(row[field]).toBe(formReplacement);
    await page.screenshot({ path: testInfo.outputPath(`${resource}-list.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("missing session-link data cannot silently clear assignments", async ({ page }) => {
  await page.route("**/api/admin/content/agenda_sessions*", (route) => respond(route, { rows: [{ ...demoGuide.sessions[0] }], hasMore: false }));
  await page.goto("/admin/agenda_sessions");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("Speaker choices are not available yet");
});

test("session picker and speaker upload form pass scoped accessibility checks", async ({ page }) => {
  test.setTimeout(60000);
  for (const resource of ["agenda_sessions", "speakers"]) {
    await page.goto(`/admin/${resource}`);
    await page.locator(".admin-record-list article").first().getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const scan = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(scan.violations).toEqual([]);
  }
});

for (const resource of ['agenda_sponsor_placements', 'lunch_locations'] as const) {
  test(`organizer saves ${resource}, retries failure and reloads the actual database row`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const db = await createDatabase();
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T,>(run: () => Promise<T>) => { const next = queue.then(run, run); queue = next.catch(() => undefined); return next; };
    const id = '71000000-0000-4000-8000-000000000001';
    const definition = adminResources[resource];
    const ad = resource === 'agenda_sponsor_placements';
    const titleField = ad ? 'headline' : 'title';
    const expectedTitle = ad ? 'Sponsor testing creative' : 'Updated event lunch';
    let failNext = true;
    try {
      await seedSecurityFixture(db);
      const original = { ...adminDefaults(definition), id, event_id: ids.event, [titleField]: 'Organizer original', ...(ad ? { sponsor_id: ids.sponsor, surface: 'home', image_format: 'square' } : { location: 'Main hall', hours: '12:00 PM', dietary_info: 'Ask the event team' }) };
      await db.query(`insert into public.${resource} select * from jsonb_populate_record(null::public.${resource},$1::jsonb)`, [JSON.stringify(original)]);
      await page.route('https://assets.example/**', route => route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' }));
      await page.route('**/api/uploads', route => respond(route, { url: 'https://assets.example/approved.webp' }));
      await page.route('**/api/admin/**', route => serial(async () => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/admin/guide') return respond(route, { ...demoGuide, mode: 'live', event: { ...demoGuide.event, id: ids.event } });
        if (path === '/api/admin/lookups') return respond(route, { sponsors: [{ id: ids.sponsor, label: 'Approved sponsor' }], agenda_days: [{ id: ids.day, label: 'Day 1' }], agenda_sessions: [] });
        if (path !== `/api/admin/content/${resource}`) return respond(route, { error: 'Unknown fixture route' }, 404);
        return asUser(db, ids.admin, async () => {
          if (route.request().method() === 'POST') {
            if (failNext) { failNext = false; return respond(route, { error: 'Synthetic save failure. Please retry.' }, 503); }
            const values = resourceSchema(definition).parse(route.request().postDataJSON().values);
            const entries = Object.entries(values);
            await db.query(`update public.${resource} set ${entries.map(([key], index) => `${key}=$${index + 1}`).join(',')} where event_id=$${entries.length + 1} and id=$${entries.length + 2}`, [...entries.map(([, value]) => value), ids.event, id]);
            return respond(route, { saved: true, record: { id } });
          }
          return respond(route, { rows: (await db.query(`select * from public.${resource} where event_id=$1`, [ids.event])).rows, hasMore: false });
        });
      }));
      await page.goto(`/admin/${resource}`); await useFixtureGuide(page);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(ad ? 'Placement headline' : 'Lunch option', { exact: false }).fill(expectedTitle);
      if (ad) {
        await dialog.getByLabel('Show advertisement on').selectOption('sponsors');
        await expect(dialog.getByLabel('Event day')).toHaveCount(0);
        await dialog.getByLabel('Image description for accessibility').fill('Approved sponsor creative');
        await dialog.getByLabel('Upload image', { exact: true }).setInputFiles(imageFile);
        await expect(dialog.getByAltText('Approved sponsor creative')).toBeVisible();
        expect((await serial(() => db.query<{ image_url: string }>(`select image_url from public.${resource} where id=$1`, [id]))).rows[0].image_url).toBe('');
        await dialog.getByLabel('Published').check();
      } else {
        await dialog.getByLabel('Location', { exact: false }).fill('Updated lunch hall');
        await dialog.getByLabel('Times', { exact: false }).fill('12:15 PM – 1:30 PM');
      }
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Synthetic save failure');
      await expect(dialog.getByLabel(ad ? 'Placement headline' : 'Lunch option', { exact: false })).toHaveValue(expectedTitle);
      await page.screenshot({ path: testInfo.outputPath(`${resource}-edit.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.reload(); await useFixtureGuide(page);
      await expect(page.getByRole('heading', { name: expectedTitle, exact: true })).toBeVisible();
      const row = (await serial(() => db.query<Record<string, unknown>>(`select * from public.${resource} where id=$1`, [id]))).rows[0];
      expect(row[titleField]).toBe(expectedTitle);
      if (ad) expect(row).toMatchObject({ image_url: 'https://assets.example/approved.webp', image_alt: 'Approved sponsor creative', surface: 'sponsors', image_format: 'square', day_id: null, after_session_id: null, published: true });
      else expect(row).toMatchObject({ location: 'Updated lunch hall', hours: '12:15 PM – 1:30 PM' });
    } finally { await page.unrouteAll({ behavior: 'wait' }); await queue; await db.close(); }
  });
}
