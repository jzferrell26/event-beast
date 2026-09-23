"use client";
import { ErrorState } from "@/components/ui";
export default function SponsorError({ reset }: { error: Error; reset: () => void }) { return <ErrorState message="Your sponsor workspace could not be loaded. Please try again." retry={reset} />; }
