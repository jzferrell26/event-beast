import { consoleGuide } from "@/lib/server/admin";
import { handle, json } from "@/lib/server/http";
export const GET = () => handle(async () => json(await consoleGuide()));
