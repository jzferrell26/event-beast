/** Deliberately tiny formatting language: bold text only; HTML stays text. */
export type DescriptionPart = { text: string; bold: boolean };
export function descriptionParts(value: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  const matches = value.matchAll(/\*\*([^*\n]+)\*\*/g);
  let offset = 0;
  for (const match of matches) {
    const at = match.index!;
    if (at > offset) parts.push({ text: value.slice(offset, at), bold: false });
    parts.push({ text: match[1], bold: true });
    offset = at + match[0].length;
  }
  if (offset < value.length) parts.push({ text: value.slice(offset), bold: false });
  return parts;
}
export const plainDescription = (value: string) => descriptionParts(value).map(part => part.text).join('');
export function toggleDescriptionBold(value: string, start: number, end: number) {
  const left = Math.max(0, Math.min(start, value.length));
  const right = Math.max(left, Math.min(end, value.length));
  if (left >= 2 && value.slice(left - 2, left) === '**' && value.slice(right, right + 2) === '**') {
    return { value: value.slice(0, left - 2) + value.slice(left, right) + value.slice(right + 2), start: left - 2, end: right - 2 };
  }
  const selected = value.slice(left, right) || 'bold text';
  return { value: value.slice(0, left) + '**' + selected + '**' + value.slice(right), start: left + 2, end: left + 2 + selected.length };
}
