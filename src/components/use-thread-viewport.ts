"use client";

import { useEffect, type RefObject } from 'react';
import { threadViewportHeight } from '@/lib/mobile-event';

export function useThreadViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const mobile = window.matchMedia('(max-width: 900px)');
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      if (!mobile.matches || (viewport?.scale ?? 1) > 1.05) { element.style.removeProperty('--thread-available-height'); return; }
      const bottom = document.querySelector('.app-shell > .bottom-nav');
      const navigation = bottom && getComputedStyle(bottom).display !== 'none' ? bottom.getBoundingClientRect().height : 0;
      const height = threadViewportHeight(viewport?.height ?? innerHeight, viewport?.offsetTop ?? 0, element.getBoundingClientRect().top, navigation);
      const next = `${height}px`;
      if (element.style.getPropertyValue('--thread-available-height') !== next) element.style.setProperty('--thread-available-height', next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    for (const node of document.querySelectorAll('.topbar,.bottom-nav,.demo-strip,.offline-banner')) observer.observe(node, { box: 'border-box' });
    const keyboard = new MutationObserver(schedule);
    keyboard.observe(document.body, { attributes: true, attributeFilter: ['data-keyboard'] });
    viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, { passive: true });
    mobile.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); keyboard.disconnect();
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule);
      mobile.removeEventListener('change', schedule); element.style.removeProperty('--thread-available-height');
    };
  }, [ref]);
}
