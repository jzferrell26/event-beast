import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const origin = process.env.REVIEW_BASE_URL || "http://127.0.0.1:3100";
const liveOrigin = "https://event-beast.vercel.app";
const out = "public/review";
await mkdir(out + "/screens", { recursive: true });
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const capturedAt = new Date().toISOString();
const browser = await chromium.launch();
try {
  const probe = await browser.newContext();
  const response = await probe.request.get(origin + "/api/guide");
  const guide = await response.json();
  if (guide.mode !== "demo") throw new Error("Visual review capture requires the explicit public demo. Never capture private live event accounts.");
  await probe.close();
  const sampleSponsor = guide.sponsors[1].id;
  const scenes = [
    { id: "home", role: "member", title: "Welcome home", path: "/", device: "phone", text: "An event-specific welcome, fast links, announcements and the next sessions." },
    { id: "agenda", role: "member", title: "Plan the day", path: "/agenda", device: "phone", text: "Switch days, search the program and save the sessions you want to attend." },
    { id: "people", role: "member", title: "Find your people", path: "/people", device: "phone", text: "An opt-in attendee directory with search, networking interests and saved connections." },
    { id: "inbox", role: "member", title: "Keep in touch", path: "/inbox", device: "phone", text: "Private one-to-one conversations. These example conversations are sample data." },
    { id: "sponsor-home", role: "sponsor", title: "Your sponsor workspace", path: "/sponsor", device: "phone", text: "Sponsors see only their assigned sponsor pages and an entry point to edit each one." },
    { id: "sponsor-editor", role: "sponsor", title: "Make a great introduction", path: "/sponsor/" + sampleSponsor, device: "desktop", text: "Edit the company introduction, logo, booth and call-to-action with an instant attendee-page preview." },
    { id: "admin", role: "admin", title: "Run the event", path: "/admin", device: "desktop", text: "Event content, agenda, sponsors, registrations and moderation from one organizer console." },
    { id: "users", role: "admin", title: "The right access for everyone", path: "/admin/users", device: "desktop", text: "Add users, choose Admin / Sponsor / Member, and assign the sponsor pages a user can edit." },
    { id: "launch", role: "admin", title: "Ready for the room", path: "/admin/launch", device: "desktop", text: "Content-readiness checks and recorded verification of real email, messaging, devices and event-network testing." },
  ];
  for (const device of ["phone", "desktop"]) {
    const context = await browser.newContext(device === "phone" ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const scene of scenes.filter((s) => s.device === device)) {
      await page.goto(origin + scene.path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.locator("h1").first().waitFor();
      const buffer = await page.screenshot({ fullPage: false });
      const compact = await sharp(buffer).webp({ quality: 88 }).toBuffer();
      await writeFile(out + "/screens/" + scene.id + ".webp", compact);
      scene.image = "data:image/webp;base64," + compact.toString("base64");
      scene.live = liveOrigin + scene.path;
    }
    await context.close();
  }
  const html = buildGallery(scenes, revision, capturedAt);
  await writeFile(out + "/event-beast-visual-review.html", html);
  const linked = buildGallery(scenes.map((scene) => ({ ...scene, image: liveOrigin + "/review/screens/" + scene.id + ".webp" })), revision, capturedAt).replace("Screenshot review is navigable offline.", "This portable viewer loads the captured screenshots online.");
  await writeFile(out + "/event-beast-linked-review.html", linked);
  await writeFile(out + "/capture.json", JSON.stringify({ revision, capturedAt, mode: "demo", scenes: scenes.map((scene) => { const metadata = { ...scene }; delete metadata.image; return metadata; }) }, null, 2));
  const review = await browser.newContext({ viewport: { width: 1680, height: 1080 }, deviceScaleFactor: 1 });
  const page = await review.newPage();
  await page.setContent(buildPrint(scenes, revision), { waitUntil: "load" });
  await page.pdf({ path: out + "/event-beast-visual-review.pdf", format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
  await page.locator(".sheet").first().screenshot({ path: out + "/event-beast-overview.png" });
  await page.setContent(html, { waitUntil: "load" });
  for (const role of ["member", "sponsor", "admin"]) {
    await page.getByRole("tab", { name: role === "member" ? "Member" : role === "sponsor" ? "Sponsor" : "Admin", exact: true }).click();
    await page.locator("#screen-image").waitFor();
  }
  await review.close();
  console.log(JSON.stringify({ revision, capturedAt, scenes: scenes.length, html: out + "/event-beast-visual-review.html", pdf: out + "/event-beast-visual-review.pdf", overview: out + "/event-beast-overview.png" }));
} finally { await browser.close(); }

function buildGallery(scenes, revision, date) {
  const payload = JSON.stringify(scenes).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Event Beast | Visual Review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f2f3;color:#1b1b21;font:14px/1.6 system-ui,-apple-system,Arial,sans-serif}button,a{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #ee3542;outline-offset:4px}header{background:#141419;color:#fff;padding:30px 5vw 32px;display:flex;justify-content:space-between;gap:25px;align-items:center}.mark{color:#ff6b75;font-weight:850;font-size:11px;letter-spacing:2px}h1{font-size:38px;letter-spacing:-1.5px;line-height:1.07;margin:11px 0}header p{color:#c4c4cf;font-size:13px;margin:10px 0 0}header a{background:#e12632;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;white-space:nowrap}.tabs{display:flex;gap:7px;background:#e4e4e8;padding:15px 5vw}.tabs button{border:1px solid #d0d0d8;background:#fff;color:#53535f;border-radius:8px;padding:10px 22px;min-height:44px;font-size:13px;font-weight:750}.tabs button[aria-selected=true]{background:#202026;color:#fff;border-color:#202026}.workspace{max-width:1540px;margin:auto;padding:30px 4vw 45px;display:grid;grid-template-columns:265px minmax(0,1fr);gap:32px}aside h2{font-size:23px;line-height:1.2;letter-spacing:-.6px;margin:0 0 12px}aside p{font-size:12px;color:#5a5a68;line-height:1.9}#scenes{display:flex;flex-direction:column;gap:9px;margin:23px 0}#scenes button{border:1px solid #d8d8df;background:#fff;border-radius:9px;text-align:left;padding:13px 15px;font-size:12px;min-height:48px;color:#565662}#scenes button.active{border-left:4px solid #e12632;background:#fcf3f4;font-weight:750;color:#20202a}.info{padding:17px;border:1px solid #d9d1b8;border-radius:9px;background:#f9f4e5;color:#69562e;font-size:11px;line-height:1.9}.viewer{min-width:0;background:#e7e7ec;border:1px solid #d7d7e0;border-radius:16px;padding:23px;display:flex;flex-direction:column;align-items:center}.screen{border:7px solid #17171d;border-radius:24px;overflow:hidden;background:#fff;box-shadow:0 18px 45px #16161b1c;width:300px;max-width:100%}.screen.desktop{border-width:6px;border-radius:12px;width:100%;max-width:1090px}.screen img{width:100%;height:auto;display:block}.caption{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;width:100%;max-width:1090px;margin-top:22px}.caption h2{font-size:19px;margin:0 0 7px;line-height:1.3}.caption p{color:#575763;font-size:12px;line-height:1.9;margin:0;max-width:550px}.caption a{color:#a51d2a;font-size:11px;font-weight:750;text-decoration:none;white-space:nowrap;min-height:44px;display:flex;align-items:center}.footer{max-width:1540px;margin:auto;padding:5px 4vw 30px;color:#656571;font-size:10px}.footer a{color:#a51d2a}.footer strong{color:#24242c}.small{font-size:10px;color:#676773;line-height:1.8;margin-top:17px}button:hover{filter:brightness(.98)}@media(max-width:800px){header{padding:26px 20px;align-items:flex-start;flex-direction:column}h1{font-size:33px}.tabs{padding:12px 20px}.tabs button{flex:1;padding:10px}.workspace{grid-template-columns:1fr;padding:23px 18px;gap:15px}aside p{margin-bottom:0}#scenes{flex-direction:row;overflow:auto;margin:16px 0}#scenes button{white-space:nowrap;font-size:11px;padding:12px}.info{font-size:10px;padding:13px}.viewer{padding:18px}.screen{width:310px}.caption{flex-direction:column;gap:5px}.caption h2{font-size:18px}.caption p{font-size:11px}.caption a{min-height:34px}.small{display:none}.footer{padding:10px 20px 25px}}
</style></head><body><header><div><div class="mark">MOMENTUM BUILDER LIVE 2026</div><h1>Event Beast. See it in action.</h1><p>Actual application screenshots · Admin, Sponsor and Member experiences</p></div><a href="${liveOrigin}" target="_blank" rel="noopener noreferrer">Open the demo ↗</a></header><nav class="tabs" role="tablist" aria-label="Experience role"><button role="tab" data-role="member" aria-selected="true">Member</button><button role="tab" data-role="sponsor" aria-selected="false">Sponsor</button><button role="tab" data-role="admin" aria-selected="false">Admin</button></nav><div class="workspace"><aside><h2 id="role-title"></h2><p id="role-description"></p><div id="scenes" aria-label="Available screens"></div><div class="info"><strong>Built application. Sample event content.</strong><br>The current deployment is a demo. Real sign-in, role assignments, message delivery and uploads need the dedicated Event Beast backend connected.</div><p class="small">Captured ${date.slice(0, 10)}<br>Source revision ${revision.slice(0, 12)}<br>No real attendee data is included.</p></aside><main class="viewer"><div class="screen" id="frame"><img id="screen-image" alt=""></div><div class="caption"><div><h2 id="screen-title"></h2><p id="screen-description"></p></div><a id="screen-link" target="_blank" rel="noopener noreferrer">Open this app screen ↗</a></div></main></div><footer class="footer"><strong>Before attendee launch:</strong> dedicated Supabase, approved sender and callback setup, confirmed agenda/sponsors/venue, attendee roster, and real-account/device/network qualification.<br>Screenshot review is navigable offline. Links to the running application require a connection.</footer><script>
const scenes=${payload};const roleInfo={member:['Your event, in your pocket.','Members explore the agenda, connect with attendees, save sessions and manage their own profile.'],sponsor:['Your brand. Your page.','Sponsors edit their assigned company pages. They can update the introduction, logo, booth and website link.'],admin:['Full control of the event.','Admins manage all event content, settings, registrations, sponsors, users and role assignments.']};let active='member';
function show(id){const s=scenes.find(x=>x.id===id);document.getElementById('screen-image').src=s.image;document.getElementById('screen-image').alt=s.title+' — actual '+s.role+' screen';document.getElementById('frame').className='screen '+(s.device==='desktop'?'desktop':'phone');document.getElementById('screen-title').textContent=s.title;document.getElementById('screen-description').textContent=s.text;document.getElementById('screen-link').href=s.live;document.querySelectorAll('#scenes button').forEach(b=>{b.classList.toggle('active',b.dataset.id===id);b.setAttribute('aria-pressed',String(b.dataset.id===id));});}
function role(r){active=r;document.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.role===r)));document.getElementById('role-title').textContent=roleInfo[r][0];document.getElementById('role-description').textContent=roleInfo[r][1];const list=document.getElementById('scenes');list.replaceChildren();scenes.filter(s=>s.role===r).forEach(s=>{const b=document.createElement('button');b.type='button';b.dataset.id=s.id;b.textContent=s.title;b.addEventListener('click',()=>show(s.id));list.append(b);});show(scenes.find(s=>s.role===r).id);}
document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>role(b.dataset.role)));role(active);
</script></body></html>`;
}

function buildPrint(scenes, revision) {
  const get = (id) => scenes.find((s) => s.id === id);
  const phone = (id) => `<div class="phone-card"><h2>${get(id).title}</h2><div class="phone"><img src="${get(id).image}" alt="${get(id).title}"></div></div>`;
  const desktop = (id, title, subtitle) => `<section class="sheet"><div class="kicker">EVENT BEAST / ${get(id).role.toUpperCase()}</div><h1>${title}</h1><p class="lead">${subtitle}</p><div class="desktop"><img src="${get(id).image}" alt="${get(id).title}"></div><footer>Actual application capture · Sample content · Revision ${revision.slice(0, 12)}</footer></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Event Beast visual review</title><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#eeeef1;color:#17171c;font-family:Arial,sans-serif}.sheet{width:297mm;height:210mm;padding:12mm 15mm 10mm;page-break-after:always;break-after:page;position:relative;overflow:hidden;background:#f5f5f6}.sheet:last-child{page-break-after:auto}.kicker{font-size:9px;font-weight:800;letter-spacing:2px;color:#b31c2a}h1{font-size:30px;line-height:1.1;letter-spacing:-1px;margin:9px 0 10px}.lead{font-size:12px;line-height:1.7;color:#5c5c69;margin:0 0 18px}.phones{display:flex;justify-content:center;gap:22mm}.phone-card{width:59mm;text-align:center}.phone-card h2{font-size:12px;color:#555562;margin:0 0 10px}.phone{border:5px solid #17171d;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px #1d1d2b18}.phone img{display:block;width:100%}.desktop{max-width:237mm;height:146mm;margin:0 auto;border:5px solid #1b1b22;border-radius:10px;overflow:hidden;background:white}.desktop img{display:block;width:100%;height:100%;object-fit:contain;object-position:top center}footer{position:absolute;bottom:7mm;left:15mm;right:15mm;font-size:8px;color:#626270;border-top:1px solid #d8d8e0;padding-top:9px}.two{display:flex;align-items:flex-start;justify-content:center;gap:25mm}.notes{width:95mm;padding:18px 24px;background:white;border:1px solid #d8d8df;border-radius:12px;font-size:12px;line-height:1.9;color:#535360}.notes h2{font-size:16px;line-height:1.4;color:#22222b}.notes strong{color:#1f1f29}.notes p{margin:12px 0}
</style></head><body>
<section class="sheet"><div class="kicker">MOMENTUM BUILDER LIVE 2026 / MEMBER EXPERIENCE</div><h1>Your event. Your people. Your next move.</h1><p class="lead">Real screenshots from the implemented app. Event dates, agenda items and attendees shown here are labeled samples.</p><div class="phones">${phone("home")}${phone("agenda")}${phone("people")}</div><footer>Event Beast visual review · Actual app captures · Demo mode · No live attendee data</footer></section>
<section class="sheet"><div class="kicker">EVENT BEAST / ACCESS MODEL</div><h1>One event. Three clear roles.</h1><p class="lead">The app experience changes with the user's assigned permissions.</p><div class="two">${phone("inbox")}<div class="notes"><h2>Admin</h2><p>Full control of event content, settings, sponsors, users and role assignments.</p><h2>Sponsor</h2><p>Edit assigned sponsor pages: company introduction, logo, booth and call-to-action. Event-wide sponsorship settings stay with the admin.</p><h2>Member</h2><p>Use the event companion, browse the agenda and directory, save sessions and communicate privately.</p><p><strong>Current release:</strong> a reviewable demo. Real accounts and live operations still require backend activation and qualification.</p></div></div><footer>Private messaging is shown with sample conversations. Screenshot review does not establish live message delivery.</footer></section>
${desktop("sponsor-editor", "Sponsor control, where it belongs.", "An editor for the pages assigned to the sponsor, with a live attendee-page preview.")}
${desktop("users", "Admins decide who can do what.", "Add users, grant Admin / Sponsor / Member access and select the sponsor pages each sponsor can edit.")}
${desktop("launch", "Make the event ready for the room.", "The Launch Center tracks event content and explicit verification of the live experience.")}
</body></html>`;
}
