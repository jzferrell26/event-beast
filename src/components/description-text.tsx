import { descriptionParts } from '@/lib/description-format';
export function DescriptionText({ text }: { text: string }) {
  return <span className="description-text">{descriptionParts(text).map((part, index) => part.bold ? <strong key={index}>{part.text}</strong> : part.text)}</span>;
}
