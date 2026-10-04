/** Organizer-requested breaks: 14 speakers, 14 more, then the remaining
 * speakers. Short/search lists clamp to their end instead of losing paid
 * placements; any additional configured ads also remain visible at the end. */
export function speakerAdPositions(speakerCount: number, adCount: number): number[] {
  if (speakerCount === 0) return [];
  return Array.from({ length: adCount }, (_, index) =>
    index < 2 ? Math.min((index + 1) * 14, speakerCount) : speakerCount);
}
