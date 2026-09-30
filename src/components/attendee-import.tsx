"use client";
import { useRef,useState } from 'react';
import { ArrowRight,FileUp } from 'lucide-react';
import type { ImportPreview } from '@/lib/validation';
import { errorMessage,mutate,RequestError } from '@/lib/client';
import { useApp } from './app-provider';
import { Busy,ErrorState,Modal } from './ui';

export function ImportDialog({open,setOpen,onImported}:{open:boolean;setOpen:(value:boolean)=>void;onImported:()=>void}) {
 const {guide,notify}=useApp();
 const [csv,setCsv]=useState(''),[name,setName]=useState(''),[preview,setPreview]=useState<ImportPreview|null>(null);
 const [busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const processing=useRef(false);
 const reset=()=>{setPreview(null);setCsv('');setName('');setError('');setConfirmed(false);};
 const close=()=>{if(processing.current)return;reset();setOpen(false);};
 const inspect=async(file?:File)=>{
  if(!file||processing.current)return;
  reset();setName(file.name);
  if(!file.name.toLowerCase().endsWith('.csv')){setError('Choose a CSV export, not an Excel workbook.');return;}
  if(file.size>1024*1024){setError('Choose a CSV under 1 MB with no more than 1,000 attendees.');return;}
  processing.current=true;setBusy(true);
  try{const text=await file.text();setCsv(text);setPreview(await mutate<ImportPreview>('/api/admin/import','POST',{csv:text,commit:false}));}
  catch(e){setError(errorMessage(e));}finally{processing.current=false;setBusy(false);}
 };
 const commit=async()=>{
  if(processing.current||!confirmed||!preview?.summary?.preview_token)return;
  processing.current=true;setBusy(true);setError('');
  try{
   const result=await mutate<{committed:boolean;created:number;existing:number;emails_sent:number}>('/api/admin/import','POST',{csv,commit:true,previewToken:preview.summary.preview_token});
   if(!result.committed)throw new Error('The import was not confirmed. Review the file again.');
   notify(`${result.created} registrations added; ${result.existing} existing registrations kept unchanged. No emails sent.`);
   reset();setOpen(false);onImported();
  }catch(e){
   setError(errorMessage(e));setConfirmed(false);
   // A lost response may follow a successful transaction. Re-preview safely;
   // never retry a write without showing the current matched registrations.
   if(!(e instanceof RequestError)||e.status===409){
    try{setPreview(await mutate<ImportPreview>('/api/admin/import','POST',{csv,commit:false}));}catch{setPreview(null);}
   }
  }finally{processing.current=false;setBusy(false);}
 };
 return <Modal open={open} onOpenChange={value=>{if(!value)close();}} title="Bring your attendees in." description="Import private registrations only. This does not create login accounts, publish profiles or send invitations.">
  <div className="import-help"><code>email,name,phone<br/>attendee@example.test,Attendee Name,</code><p>Email Address / Full Name or First Name / Last Name headers also work. Other columns are ignored.</p><a href="/attendee-import-template.csv" download className="text-button">Get the CSV template<ArrowRight size={14}/></a></div>
  <label className="import-drop"><FileUp size={29}/><strong>{busy?'Checking your file…':name||'Choose your attendee CSV'}</strong><span>Up to 1,000 registrations · 1 MB maximum</span><input aria-label="Attendee CSV file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{void inspect(e.target.files?.[0]);e.target.value='';}}/></label>
  {error&&<ErrorState message={error}/>}
  {preview&&<div className="import-preview">
   <h3>{preview.errors.length?`${preview.errors.length} ${preview.errors.length===1?'issue':'issues'} to fix`:`${preview.rows.length} ${preview.rows.length===1?'registration':'registrations'} ready to import`}</h3>
   {preview.errors.length?<div className="import-errors">{preview.errors.slice(0,15).map((issue,i)=><p key={i}><strong>{issue.row?`Row ${issue.row}: `:''}</strong>{issue.message}</p>)}{preview.errors.length>15&&<p>And {preview.errors.length-15} more. Correct the file and upload again.</p>}</div>:<>
    {preview.summary&&<div className="import-counts" aria-label="Roster preview"><p><strong>{preview.summary.new}</strong> new registrations</p><p><strong>{preview.summary.existing}</strong> existing — kept unchanged</p><p>{preview.summary.claimed} already connected · {preview.summary.disabled} disabled · {preview.summary.pending} pending · {preview.summary.privileged} Admin/Sponsor</p></div>}
    <div className="import-sample">{preview.rows.slice(0,5).map(row=><div key={row.email}><strong>{row.name}</strong><span>{row.email}</span></div>)}</div>
    <p className="fine-print">Existing names, phones, roles, access status and profile visibility are not overwritten. New registrations are Members; attendees must verify their email and choose profile visibility themselves.</p>
    {!!preview.summary?.new&&<label className="admin-checkbox"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>I reviewed this roster. Add only missing registrations; do not send emails.</span></label>}
    {preview.summary?.new===0&&<p role="status">Everyone in this file is already registered. No changes are needed.</p>}
   </>}
   {preview.warnings?.map((warning,i)=><p className="fine-print" key={i}>{warning}</p>)}
  </div>}
  <div className="dialog-actions"><button className="button button-outline" type="button" disabled={busy} onClick={close}>Close</button><button className="button button-red" type="button" disabled={busy||!confirmed||!preview?.summary?.new||!!preview.errors.length||guide.mode==='demo'} onClick={()=>void commit()}>{busy?<Busy label="Working…"/>:guide.mode==='demo'?'Preview only':'Import registrations'}</button></div>
 </Modal>;
}
