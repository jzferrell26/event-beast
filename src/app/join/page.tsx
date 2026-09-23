import { redirect } from 'next/navigation';
export default function JoinPage() { redirect('/auth?mode=sign-up&next=/more/profile'); }
