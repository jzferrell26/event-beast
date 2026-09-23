"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useApp } from "./app-provider";
import { EmptyState, ErrorState, LoadingCards } from "./ui";

// Server entrypoints and RLS remain authoritative. This boundary additionally
// unmounts private client views when a session refresh reports access loss.
export function MemberBoundary({ children }: { children: ReactNode }) {
  const { guide, me, meError, refreshMe } = useApp();
  if (guide.mode === "demo" || me?.eligible) return children;
  if (meError) return <ErrorState message={meError} retry={() => void refreshMe()} />;
  if (!me) return <LoadingCards />;
  return <EmptyState title="Let’s check your event access." action={<Link className="button button-dark" href={me.authenticated ? "/access" : "/auth"}>{me.authenticated ? "Check my registration" : "Sign in"}</Link>}>
    {me.status === "disabled" ? "Your event access is paused. The event team can help." : "Sign in with an approved event registration to use this part of the app."}
  </EmptyState>;
}
