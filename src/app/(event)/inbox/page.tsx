import { InboxScreen } from "@/components/inbox";
import { pageAccess } from "@/lib/server/auth";
export const metadata = { title: "Inbox" };
export default async function InboxPage() { await pageAccess("/inbox"); return <InboxScreen />; }
