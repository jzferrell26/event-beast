"use client";

import { useState } from "react";
import { httpsUrl, initials } from "@/lib/format";

/** Directory portraits share one consistent editorial frame. Source images may
 * crop at the edges so every speaker fills the same card without gray bars. */
export function SpeakerPortrait({ name, src, priority = false, fill = false }: {
  name: string; src?: string | null; priority?: boolean; fill?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const local = src?.startsWith("/speakers/") && !src.includes("..") && !src.includes("\\") ? src : null;
  const url = local || httpsUrl(src);
  return <div className={`speaker-portrait${fill ? ' speaker-portrait-fill' : ''}`}>
    {url && failedSrc !== url ? <img
      src={url} alt={`${name} portrait`} width={800} height={1000}
      loading={priority ? "eager" : "lazy"} decoding="async"
      onError={() => setFailedSrc(url)}
    /> : <div className="speaker-portrait-placeholder" role="img" aria-label={`Portrait unavailable for ${name}`}>
      <span aria-hidden="true">{initials(name)}</span><small>Portrait coming soon</small>
    </div>}
  </div>;
}
