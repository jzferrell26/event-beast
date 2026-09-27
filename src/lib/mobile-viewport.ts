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
  const update = () => {
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
    const offline = document.querySelector('.offline-banner')?.getBoundingClientRect().height ?? 0;
    const topbar = document.querySelector('.app-shell .topbar')?.getBoundingClientRect().height ?? 76;
    document.documentElement.style.setProperty('--offline-banner-height', `${offline}px`);
    document.documentElement.style.setProperty('--app-header-offset', `${topbar + offline}px`);
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  for (const element of document.querySelectorAll('.app-shell .topbar,.offline-banner')) observer.observe(element);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  narrow.addEventListener('change', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule);
    narrow.removeEventListener('change', schedule);
    document.body.dataset.keyboard = 'false';
  };
}
