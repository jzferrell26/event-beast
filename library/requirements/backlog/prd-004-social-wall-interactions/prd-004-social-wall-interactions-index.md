# PRD-004 — Social Wall photos, replies and likes

Source: Sonia Le’s October 2, 2026 “big thing needed” email and 23:18 UTC follow-up, reviewed in Jonathan’s Outlook. Jonathan authorized authoring and implementation in this conversation. Sonia prioritizes event photos, requires replies, requests likes, and asks that the wall be withdrawn if these are not available within 24 hours. Do not disable it automatically or substitute Fun Stuff for the Social Wall.

## Release scope

1. Photo posts: one photo per post in this release, with an optional caption; text-only posts remain supported. Select from the phone library/camera using the native picker, preview/remove before posting, and tap to view the full uncropped photo. Resize large browser-decodable photos before transfer; server validates/re-encodes and strips metadata. JPEG, PNG and WebP are supported; unsupported formats receive an actionable error rather than a false success. No video, albums, or external arbitrary image URLs.
2. Replies: one-level comment threads on posts, with name/avatar/time, durable paginated history, create, own edit/remove, report and organizer hide/restore. No change to private messaging. Preserve a failed draft; repeat requests must not create duplicate replies.
3. Likes: explicit like/unlike and count, one like per event member per post. A retry sets the desired state rather than toggling twice. No follower system or public list of liker contact details.
4. Moderation: existing post reporting/hide/restore includes attached photos; add equivalent reply moderation in Admin. Hiding a post suppresses its photo, replies and interactions for members. An author cannot undo moderator hiding. Keep audit records and existing member block/disable rules.

## Security and operational boundaries

Use the existing dedicated backend and current member session. Store photos in a new **private** bucket, not public event assets. Serve photos through an authenticated, no-store endpoint with storage RLS; never introduce public photo links or Cache API entries. Member actions require verified approved event access, enabled community/feed, same-origin HTTP writes, event-scoped database constraints, ownership checks and bounded inputs. Admin/Sponsor role assignment and private contact projections are unchanged. No bulk email, SMS, notifications, domain change, paid provisioning or hosted load test is authorized by this increment.

The event now permits self-service verified Members: photo/comment visibility means the signed-in event community, not proof that someone bought a ticket. Never imply otherwise. Directory and private-message opt-ins remain separate from intentionally posting on the wall.

## Acceptance gates

| Gate | Required evidence |
|---|---|
| 004-AC-001 | Text-only, photo-only and photo-with-caption survive reload; large supported phone photos prepare successfully; invalid/oversized/disguised files fail honestly. |
| 004-AC-002 | Lost upload/post/reply response can retry without duplicate objects/posts/replies; changed payload under a used key is rejected. |
| 004-AC-003 | Replies paginate, retain drafts after failure, and allow only own edits/removal; likes are unique and desired-state idempotent. |
| 004-AC-004 | Anonymous, unverified, disabled, blocked and wrong-event identities cannot access protected media or interact; forged authors/moderator fields and direct writes fail. |
| 004-AC-005 | Admin can review photos and reports, hide/restore posts/replies; hidden parent content disappears for members and author edits cannot restore it. |
| 004-AC-006 | Mobile Chromium/WebKit, desktop, keyboard/dialog controls and accessibility checks pass; no horizontal overflow or new private-chat regression. |
| 004-AC-007 | Full source/CI checks pass; deployed revision matches main; two disposable accounts verify actual hosted upload, reply, like, reload and moderation; cleanup is confirmed. |

## Implementation order

Author scope → additive database/storage controls → APIs → mobile UI/moderation → database/API/browser qualification → reviewed PR and migration → production verification and exact-ID cleanup. Keep the existing three-argument text-post RPC compatible with the prior release. Record evidence and remaining physical-phone acceptance in docs/SOCIAL-WALL-INTERACTIONS.md and docs/QUALIFICATION.md; do not label planned or fixture-only checks as production proof.

## Rollback

The existing Admin feed/community switches can pause the wall. Revert the application to the prior deployment only with the additive schema left in place. No destructive down migration, deletion of real content, or automatic organizer communications. Unattached test uploads must be removed through the Storage API; never delete storage metadata alone.
