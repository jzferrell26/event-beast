import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, asUser, ids, seedSecurityFixture } from './db-harness';
import { newerMessageId, shouldShowMessageNotice, EMPTY_ATTENTION } from '../src/lib/message-attention';

describe('private unread summary', () => {
  let db: PGlite;
  let conversation: string;
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true }); await seedSecurityFixture(db);
    await db.query('update public.event_settings set community_enabled=true,messaging_enabled=true,directory_enabled=true where event_id=$1', [ids.event]);
    await db.query('update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=$1', [ids.event]);
    conversation = (await asUser(db, ids.alice, () => db.query<{ id: string }>('select public.open_conversation($1,$2) as id', [ids.event, ids.bobAttendee]))).rows[0].id;
  });
  afterAll(async () => { await db.close(); });
  const summary = (user: string|null, event = ids.event) => asUser(db, user, () => db.query<{ unread_count: number; latest_id: string|null; conversation_id: string|null }>('select * from public.message_attention($1)', [event]));

  it('counts incoming but never own outgoing messages, and reflects authoritative reads', async () => {
    const send = await asUser(db, ids.alice, () => db.query<{ id: number }>('select (public.send_message($1,$2,gen_random_uuid(),$3)).id as id', [ids.event, conversation, 'Synthetic incoming message']));
    expect((await summary(ids.alice)).rows[0].unread_count).toBe(0);
    const result = (await summary(ids.bob)).rows[0];
    expect(result).toMatchObject({ unread_count: 1, latest_id: String(send.rows[0].id), conversation_id: conversation });
    expect(Object.keys(result).sort()).toEqual(['conversation_id','latest_id','unread_count']);
    await asUser(db, ids.bob, () => db.query('select public.mark_conversation_read($1,$2,$3)', [ids.event, conversation, send.rows[0].id]));
    expect((await summary(ids.bob)).rows[0]).toEqual({ unread_count: 0, latest_id: null, conversation_id: null });
  });
  it('does not notify either direction of a block and cannot read another event or anonymous/disabled/unverified access', async () => {
    await asUser(db, ids.alice, () => db.query('select public.send_message($1,$2,gen_random_uuid(),$3)', [ids.event, conversation, 'Before blocking']));
    await asUser(db, ids.alice, () => db.query('select public.set_attendee_block($1,$2,true)', [ids.event, ids.bobAttendee]));
    expect((await summary(ids.bob)).rows[0].unread_count).toBe(0);
    await asUser(db, ids.alice, () => db.query('select public.set_attendee_block($1,$2,false)', [ids.event, ids.bobAttendee]));
    expect((await summary(ids.bob)).rows[0].unread_count).toBe(1);
    for (const user of [null, ids.outsider, ids.unverified, ids.admin]) await expect(summary(user)).rejects.toThrow();
    await expect(summary(ids.bob, ids.otherEvent)).rejects.toThrow();
    await db.query("update public.attendees set status='disabled' where id=$1", [ids.bobAttendee]);
    await expect(summary(ids.bob)).rejects.toThrow();
    await db.query("update public.attendees set status='approved' where id=$1", [ids.bobAttendee]);
  });
  it('is not limited to the first 30 conversations and never grants direct writes', async () => {
    // Synthetic distinct peers; bypassing the send RPC here only seeds fixtures.
    const peers = await db.query<{ id: string; registration_email: string }>(`insert into public.attendees(event_id,registration_email,registration_name) select $1,'unread-peer-'||n||'@example.test','Unread peer' from generate_series(1,35) n returning id,registration_email`, [ids.event]);
    for (const peer of peers.rows) {
      const user = (await db.query<{ id: string }>('insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),$1,now()) returning id', [peer.registration_email])).rows[0].id;
      await asUser(db,user,() => db.query('select public.claim_attendee($1)',[ids.event]));
      await db.query('update public.attendee_profiles set directory_visible=true,messaging_available=true where attendee_id=$1',[peer.id]);
      const convo = (await asUser(db,user,() => db.query<{ id: string }>('select public.open_conversation($1,$2) as id',[ids.event,ids.bobAttendee]))).rows[0];
      await asUser(db,user,() => db.query("select public.send_message($1,$2,gen_random_uuid(),'Synthetic peer message')",[ids.event,convo.id]));
    }
    expect((await summary(ids.bob)).rows[0].unread_count).toBe(36);
    const permission = await db.query("select has_function_privilege('anon','public.message_attention(uuid)','EXECUTE') as anonymous_allowed");
    expect(permission.rows).toEqual([{ anonymous_allowed: false }]);
    await expect(asUser(db, ids.bob, () => db.query('delete from public.messages where conversation_id=$1', [conversation]))).rejects.toThrow();
  });
});

describe('message-notice decisions', () => {
  const incoming = { unread: 2, latestId: '9007199254740995', conversationId: 'thread-1' };
  it('does not alert on first load, a read receipt, a duplicate, or the conversation being viewed', () => {
    expect(shouldShowMessageNotice(incoming, null, '/')).toBe(false);
    expect(shouldShowMessageNotice(incoming, incoming, '/')).toBe(false);
    expect(shouldShowMessageNotice({ ...incoming, unread: 0 }, EMPTY_ATTENTION, '/')).toBe(false);
    expect(shouldShowMessageNotice(incoming, EMPTY_ATTENTION, '/inbox/thread-1')).toBe(false);
  });
  it('detects new incoming messages off-thread without bigint precision loss', () => {
    expect(shouldShowMessageNotice(incoming, EMPTY_ATTENTION, '/')).toBe(true);
    expect(newerMessageId('9007199254740995','9007199254740994')).toBe(true);
    expect(newerMessageId('9007199254740994','9007199254740995')).toBe(false);
    expect(newerMessageId('not-a-number','1')).toBe(false);
  });
});
