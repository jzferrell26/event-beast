"use client";
import { useApp } from './app-provider';
import { Copy, Wifi } from 'lucide-react';

export function EventSupport() {
  const { guide } = useApp();
  const email = guide.settings.support_email;
  const phone = guide.settings.support_sms ?? '';
  const digits = phone.replace(/\D/g, '');
  const sms = digits.length === 10 ? '+1' + digits : digits.length === 11 && digits.startsWith('1') ? '+' + digits : null;
  return <div className="event-support-copy">
    {email && <p><strong><a href={'mailto:' + email}>Email us at {email}</a></strong></p>}
    {sms && <p><strong><a href={'sms:' + sms}>Text us at {phone}</a></strong></p>}
    <p><strong>Or come to the registration table</strong></p>
  </div>;
}

export function EventWifi() {
  const { guide, notify } = useApp();
  const network = guide.settings.wifi_network;
  const password = guide.settings.wifi_password;
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); notify(label + ' copied.'); }
    catch { notify('Copy is unavailable. Select the displayed text to copy it.', true); }
  };
  if (!network) return null;
  return <section className="event-wifi" id="event-wifi" aria-label="Event Wi-Fi">
    <Wifi size={26} aria-hidden="true" /><h2>Wi-Fi at the event.</h2>
    <dl><div><dt>Network</dt><dd><code>{network}</code><button type="button" className="icon-button" aria-label="Copy Wi-Fi network" onClick={() => void copy(network, 'Wi-Fi network')}><Copy size={17} /></button></dd></div>
    {password && <div><dt>Password</dt><dd><code>{password}</code><button type="button" className="icon-button" aria-label="Copy Wi-Fi password" onClick={() => void copy(password, 'Wi-Fi password')}><Copy size={17} /></button></dd></div>}</dl>
  </section>;
}
