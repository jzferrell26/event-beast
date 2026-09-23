"use client";
import { ErrorState } from "@/components/ui";
export default function EventError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ErrorState message="This part of the event could not be loaded. Please check your connection and try again." retry={reset} />; }
