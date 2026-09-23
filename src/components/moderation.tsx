"use client";
import { useState } from "react";
import { Ban, Flag } from "lucide-react";
import { errorMessage, mutate } from "@/lib/client";
import { useApp } from "./app-provider";
import { Busy, Modal } from "./ui";

export function ModerationActions({ target, blocked = false, messageId, onChange }: { target: string; blocked?: boolean; messageId?: number; onChange?: () => void }) {
  const { guide, notify } = useApp();
  const [action, setAction] = useState<"block" | "report" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (guide.mode === "demo") { notify("This is a sample profile. Moderation actions are available for registered attendees in the live event."); return; }
    setBusy(true);
    try {
      await mutate("/api/moderation", "POST", action === "block" ? { action, target, blocked: !blocked } : { action, target, reason, ...(messageId ? { messageId } : {}) });
      setAction(null); setReason("");
      notify(action === "report" ? "Your report has been sent to the event team." : blocked ? "Attendee unblocked." : "Attendee blocked. You will no longer receive new messages from each other.");
      onChange?.();
    } catch (error) { notify(errorMessage(error), true); }
    finally { setBusy(false); }
  };
  return <><div className="moderation-actions"><button type="button" onClick={() => setAction("block")}><Ban size={15} />{blocked ? "Unblock" : "Block"}</button><button type="button" onClick={() => setAction("report")}><Flag size={15} />{messageId ? "Report message" : "Report"}</button></div><Modal open={Boolean(action)} onOpenChange={(open) => { if (!open && !busy) setAction(null); }} title={action === "report" ? "Let the event team know." : blocked ? "Unblock this attendee?" : "Block this attendee?"} description={action === "report" ? "Your report is shared with the organizer. For immediate help at the event, visit the welcome desk." : blocked ? "They can message you again when both of you have messaging enabled." : "New messages stop in both directions. Your existing conversation history remains available to you."}>
    {action === "report" && <label className="form-field"><span>What happened?</span><textarea rows={5} maxLength={2000} minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Share enough detail for the event team to help." />{messageId && <small>The selected message will be included with your report.</small>}</label>}
    <div className="dialog-actions"><button className="button button-outline" type="button" onClick={() => setAction(null)} disabled={busy}>Cancel</button><button className="button button-dark" type="button" onClick={() => void submit()} disabled={busy || (action === "report" && reason.trim().length < 3)}>{busy ? <Busy /> : action === "report" ? "Send report" : blocked ? "Unblock attendee" : "Block attendee"}</button></div>
  </Modal></>;
}
