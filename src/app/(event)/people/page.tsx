import { PeopleScreen } from "@/components/people";
import { pageAccess } from "@/lib/server/auth";
export const metadata = { title: "People" };
export default async function PeoplePage() { await pageAccess("/people"); return <PeopleScreen />; }
