import {test,expect,type Route} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {demoGuide,demoMe} from '../../src/lib/demo';
import {parseAttendeeCsv} from '../../src/lib/validation';
import {asUser,createDatabase,ids,seedSecurityFixture} from '../db-harness';
test.use({serviceWorkers:'block'});
const respond=(route:Route,data:unknown,status=200)=>route.fulfill({status,json:data,headers:{'Cache-Control':'private, no-store'}});

test('review counts, preserve existing people, and require a new preview after an uncertain import response',async({page},info)=>{
 test.setTimeout(90000);
 const db=await createDatabase();let queue:Promise<unknown>=Promise.resolve();
 const serial=<T,>(fn:()=>Promise<T>)=>{const job=queue.then(fn,fn);queue=job.catch(()=>undefined);return job;};
 let lostResponse=true,writes=0;
 try{
  await seedSecurityFixture(db);
  await page.route('**/api/me',r=>respond(r,{...demoMe,isAdmin:true,eligible:true,authenticated:true}));
  await page.route('**/api/admin/**',route=>serial(async()=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/admin/guide')return respond(route,{...demoGuide,mode:'live',event:{...demoGuide.event,id:ids.event}});
   if(path==='/api/admin/attendees')return respond(route,{rows:(await db.query('select * from public.attendees where event_id=$1',[ids.event])).rows,hasMore:false});
   if(path!=='/api/admin/import')return respond(route,{});
   const body=route.request().postDataJSON();const parsed=parseAttendeeCsv(body.csv);
   if(parsed.errors.length)return respond(route,{...parsed,committed:false});
   return asUser(db,ids.admin,async()=>{
    if(!body.commit){const result=(await db.query<{result:Record<string,unknown>}>('select public.preview_attendee_import($1,$2) as result',[ids.event,JSON.stringify(parsed.rows)])).rows[0].result;return respond(route,{...parsed,summary:result,committed:false});}
    writes++;
    const result=(await db.query<{result:Record<string,unknown>}>('select public.commit_attendee_import($1,$2,$3) as result',[ids.event,JSON.stringify(parsed.rows),body.previewToken])).rows[0].result;
    if(lostResponse){lostResponse=false;return respond(route,{error:'Synthetic connection lost after commit'},409);}
    return respond(route,{...result,committed:true});
   });
  }));
  await page.goto('/admin/attendees');await page.waitForLoadState('networkidle');
  await expect.poll(async()=>{await page.evaluate(()=>dispatchEvent(new Event('focus')));return page.locator('.admin-demo').count();}).toBe(0);
  await page.getByRole('button',{name:'Import attendees',exact:true}).click();
  const dialog=page.getByRole('dialog'),file=dialog.getByLabel('Attendee CSV file');
  await file.setInputFiles({name:'roster.csv',mimeType:'text/csv',buffer:Buffer.from('Email Address,Full Name,Role\nalice@example.test,Wrong old name,admin\nroster-new@example.test,New Person,admin')});
  await expect(dialog.getByLabel('Roster preview')).toContainText('1 new registrations');
  await expect(dialog.getByLabel('Roster preview')).toContainText('1 existing');
  await expect(dialog.getByText('Ignored columns:',{exact:false})).toBeVisible();
  const commit=dialog.getByRole('button',{name:'Import registrations',exact:true});await expect(commit).toBeDisabled();
  await dialog.getByRole('checkbox').check();await commit.click();
  await expect(dialog.getByText('Everyone in this file is already registered.',{exact:false})).toBeVisible();
  await expect(commit).toBeDisabled();expect(writes).toBe(1);
  const original=(await serial(()=>db.query<{registration_name:string}>('select registration_name from public.attendees where id=$1',[ids.aliceAttendee]))).rows[0];expect(original.registration_name).toBe('Alice Sample');
  const newRow=(await serial(()=>db.query<{access_role:string;user_id:string|null}>("select access_role,user_id from public.attendees where registration_email='roster-new@example.test'"))).rows[0];expect(newRow).toEqual({access_role:'member',user_id:null});
  await file.setInputFiles({name:'next.csv',mimeType:'text/csv',buffer:Buffer.from('email,first name,last name\nroster-second@example.test,Another,Person')});
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();await dialog.getByRole('checkbox').check();
  expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('roster-preview.png'),fullPage:true});
  await commit.click();await expect(dialog).toHaveCount(0);
  expect(writes).toBe(2);
 }finally{await page.unrouteAll({behavior:'wait'});await queue;await db.close();}
});
