"use client";

import { mobileKeyboardOpen } from './mobile-event';

/** One set of listeners, coalesced into animation frames; no resize polling.
 * Keep the existing visual-height contract for modals and desktop callers. */
export function observeMobileViewport(): () => void {
  const viewport = window.visualViewport;
  const narrow = window.matchMedia('(max-width: 900px)');
  let frame = 0;
  let baseline = window.innerHeight;
  let width = window.innerWidth;
  const observed = new Set<Element>();
  const observeHeaders = () => {
    const current = new Set(document.querySelectorAll('.app-shell .topbar,.offline-banner'));
    for (const element of observed) if (!current.has(element)) { observer.unobserve(element); observed.delete(element); }
    // Safe-area padding can change the outer header height while leaving its
    // content box unchanged. Sticky offsets depend on the border box.
    for (const element of current) if (!observed.has(element)) { observer.observe(element, { box: 'border-box' }); observed.add(element); }
  };
  const update = () => {
    // Streaming/route transitions can attach the shell after the provider's
    // first effect. Observe the real current nodes, not an initial empty list.
    observeHeaders();
    const active = document.activeElement;
    const editing = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement
      && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(active.type))
      || active instanceof HTMLElement && active.isContentEditable;
    if (!editing || Math.abs(window.innerWidth - width) > 80) { baseline = window.innerHeight; width = window.innerWidth; }
    const height = viewport?.height ?? window.innerHeight;
    const scale = viewport?.scale ?? 1;
    const keyboard = narrow.matches && mobileKeyboardOpen({ layoutHeight: window.innerHeight, baselineHeight: baseline,
      visualHeight: height, visualTop: viewport?.offsetTop ?? 0, scale, editing });
    document.documentElement.style.setProperty('--visual-height', `${height}px`);
    document.documentElement.style.setProperty('--visual-top', `${viewport?.offsetTop ?? 0}px`);
    document.body.dataset.keyboard = String(keyboard);
    const visible = (selector: string) => [...document.querySelectorAll(selector)].find(element => element.getClientRects().length > 0);
    const offline = visible('.offline-banner')?.getBoundingClientRect().height ?? 0;
    const topbar = visible('.app-shell .topbar')?.getBoundingClientRect().height ?? 76;
    document.documentElement.style.setProperty('--offline-banner-height', `${offline}px`);
    document.documentElement.style.setProperty('--app-header-offset', `${topbar + offline}px`);
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  const mounting = new MutationObserver(schedule);
  mounting.observe(document.body, { childList: true, subtree: true });
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  narrow.addEventListener('change', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect(); mounting.disconnect();
    viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule);
    narrow.removeEventListener('change', schedule);
    document.body.dataset.keyboard = 'false';
  };
}
