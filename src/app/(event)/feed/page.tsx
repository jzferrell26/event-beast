import { FeedScreen } from "@/components/feed";
import { pageAccess } from "@/lib/server/auth";
export const metadata = { title: "Feed" };
export default async function FeedPage() { await pageAccess("/feed"); return <FeedScreen />; }
