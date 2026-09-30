import { describe,expect,it } from 'vitest';
import { parseAttendeeCsv } from '../src/lib/validation';
describe('CSV intake variants',()=>{
 it('accepts explicit name/email aliases and quoted commas',()=>{const p=parseAttendeeCsv('Email Address,Full Name,Phone Number\n JANE@EXAMPLE.TEST ,"Smith, Jane",+15551230000');expect(p.errors).toEqual([]);expect(p.rows).toEqual([{email:'jane@example.test',name:'Smith, Jane',phone:'+15551230000'}]);});
 it('combines first/last name without creating profile fields',()=>{const p=parseAttendeeCsv('Email,First Name,Last Name,Role,Company\na@example.test,Alex,Sample,admin,PRIVATE');expect(p.errors).toEqual([]);expect(p.rows).toEqual([{email:'a@example.test',name:'Alex Sample'}]);expect(p.warnings[0]).toContain('Ignored columns: role, company');});
 it('rejects two columns that normalize to the same email/name mapping',()=>{expect(parseAttendeeCsv('email,Email Address,name\na@example.test,b@example.test,A').errors.some(e=>e.message.includes('unique'))).toBe(true);});
 it('uses explicit full name when split name columns coexist and explains that choice',()=>{const p=parseAttendeeCsv('email,name,first_name,last_name\na@example.test,Preferred Name,Other,Person');expect(p.rows[0].name).toBe('Preferred Name');expect(p.warnings.join()).toContain('ignored');});
 it('does not choose ambiguous billing addresses as registration email',()=>{expect(parseAttendeeCsv('billing email,name\na@example.test,A').errors.length).toBeGreaterThan(0);});
});
