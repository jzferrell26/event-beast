"use client";

import { useEffect, type RefObject } from 'react';

let viewportOwner: HTMLElement | null = null;

/** Mobile chat has one scrollable message pane, not a growing page behind the
 * keyboard. Anchor its shell to VisualViewport without measuring a moving
 * thread top: feeding getBoundingClientRect().top back into the height caused
 * root-scroll/height feedback when iOS panned to the focused composer. */
export function useThreadViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const shell = element?.closest<HTMLElement>('.app-shell');
    if (!element || !shell) return;
    const root = document.documentElement;
    const mobile = window.matchMedia('(max-width: 900px)');
    const viewport = window.visualViewport;
    let frame = 0;
    const release = () => {
      if (viewportOwner !== element) return;
      shell.removeAttribute('data-thread-viewport');
      shell.style.removeProperty('--thread-viewport-top');
      shell.style.removeProperty('--thread-viewport-height');
      viewportOwner = null; root.removeAttribute('data-thread-viewport');
    };
    const update = () => {
      // Do not counteract pinch zoom or lock an inactive retained route.
      if (!mobile.matches || Math.abs((viewport?.scale ?? 1) - 1) > 0.05 || !element.getClientRects().length) { release(); return; }
      const height = viewport?.height ?? innerHeight;
      const top = Math.max(0, viewport?.offsetTop ?? 0);
      if (!Number.isFinite(height) || !Number.isFinite(top) || height <= 0) return;
      const banner = [...document.querySelectorAll('.offline-banner')].find(node => node.getClientRects().length > 0);
      const offline = banner?.getBoundingClientRect().height ?? 0;
      const acquired = viewportOwner !== element;
      viewportOwner = element;
      root.dataset.threadViewport = 'true';
      shell.dataset.threadViewport = 'true';
      shell.style.setProperty('--thread-viewport-top', `${top + offline}px`);
      shell.style.setProperty('--thread-viewport-height', `${Math.max(0, height - offline)}px`);
      if (acquired) window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    const observe = () => { for (const node of document.querySelectorAll('.offline-banner')) observer.observe(node, { box: 'border-box' }); schedule(); };
    const mounting = new MutationObserver(observe);
    mounting.observe(document.body, { childList: true, subtree: true });
    viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    mobile.addEventListener('change', schedule);
    observe();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mounting.disconnect();
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule); window.removeEventListener('pageshow', schedule);
      mobile.removeEventListener('change', schedule); release();
    };
  }, [ref]);
}
