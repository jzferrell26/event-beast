"use client";
import { useId, useRef, useState } from 'react';
import { Bold } from 'lucide-react';
import { toggleDescriptionBold } from '@/lib/description-format';
import { DescriptionText } from './description-text';
export function DescriptionEditor({ label, value, maxLength, required, onChange }: { label: string; value: string; maxLength: number; required?: boolean; onChange: (value: string) => void }) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const bold = () => {
    const element = input.current;
    if (!element) return;
    const next = toggleDescriptionBold(value, element.selectionStart, element.selectionEnd);
    if (next.value.length > maxLength) { setError('Shorten the description before adding formatting.'); return; }
    setError(''); onChange(next.value);
    requestAnimationFrame(() => { element.focus({ preventScroll: true }); element.setSelectionRange(next.start, next.end); });
  };
  return <div className="form-field description-editor"><label htmlFor={id}>{label}</label><div className="description-toolbar"><button className="button button-outline button-small" type="button" aria-label="Bold selected description text" onMouseDown={event => event.preventDefault()} onClick={bold}><Bold size={16} />Bold</button><small>Select words, then Bold. You can also use **bold text**.</small></div><textarea id={id} ref={input} rows={5} required={required} maxLength={maxLength} value={value} onChange={event => { setError(''); onChange(event.target.value); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); bold(); } }} />{error && <p role="alert">{error}</p>}<div className="description-preview" aria-label="Description preview"><small>Preview</small><p><DescriptionText text={value || 'Your session description will appear here.'} /></p></div></div>;
}
