"use client";
import { ErrorState } from "@/components/ui";
export default function AdminError({ reset }: { error: Error; reset: () => void }) { return <ErrorState message="The organizer section could not be loaded. Please try again." retry={reset} />; }
