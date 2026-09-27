"use client";

import { useState } from "react";
import { httpsUrl, initials } from "@/lib/format";

/** Speaker photos are editorial portraits, not square attendee avatars.
 * Keep the entire source visible, including unusually tall or wide images. */
export function SpeakerPortrait({ name, src, priority = false }: {
  name: string; src?: string | null; priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const local = src?.startsWith("/speakers/") && !src.includes("..") && !src.includes("\\") ? src : null;
  const url = local || httpsUrl(src);
  return <div className="speaker-portrait">
    {url && failedSrc !== url ? <img
      src={url} alt={`${name} portrait`} width={800} height={1000}
      loading={priority ? "eager" : "lazy"} decoding="async"
      onError={() => setFailedSrc(url)}
    /> : <div className="speaker-portrait-placeholder" role="img" aria-label={`Portrait unavailable for ${name}`}>
      <span aria-hidden="true">{initials(name)}</span><small>Portrait coming soon</small>
    </div>}
  </div>;
}
