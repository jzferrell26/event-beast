import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { backendEnvironment, query } from './backend-cli.mjs';

const state = JSON.parse(readFileSync('supabase/.temp/auth-qualification.json', 'utf8'));
if (state.phase !== 'qualified') throw new Error('Synthetic cohort required');
const env = backendEnvironment();
const clients = [2, 3].map(() => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
let received = false;
try {
  for (let index = 0; index < clients.length; index++) {
    const result = await clients[index].auth.signInWithPassword({ email: state.users[index + 2].email, password: state.password });
    if (result.error) throw new Error('Synthetic sign-in failed');
    await clients[index].realtime.setAuth(result.data.session.access_token);
  }
  const receiver = clients[1].channel(`event:${state.event}:attendee:${state.users[3].attendeeId}`, { config: { private: true } });
  const notification = new Promise(resolve => {
    receiver.on('broadcast', { event: '*' }, data => { received = true; console.log(JSON.stringify({ receivedEvent: data.event, payloadKeys: Object.keys(data.payload ?? {}) })); resolve(true); });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Private subscription timed out')), 10000);
    receiver.subscribe(status => { console.log(JSON.stringify({ subscription: status })); if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } });
  });
  const conversation = await clients[0].rpc('open_conversation', { p_event: state.event, p_recipient: state.users[3].attendeeId });
  if (conversation.error) throw new Error('Synthetic conversation denied');
  const sent = await clients[0].rpc('send_message', { p_event: state.event, p_conversation: conversation.data, p_client_id: randomUUID(), p_body: 'Realtime transport verification' });
  console.log(JSON.stringify({ persisted: !sent.error, databaseCode: sent.error?.code ?? null }));
  await Promise.race([notification, new Promise(resolve => setTimeout(resolve, 8000))]);
  const stored = query(`select extension, event, private, count(*)::int from realtime.messages where topic like 'event:${state.event}:%' group by extension,event,private`);
  console.log(JSON.stringify({ received, storedNotifications: stored }));
} finally { for (const client of clients) { await client.removeAllChannels(); await client.auth.signOut({ scope: 'local' }); } }
