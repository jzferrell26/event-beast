'use client';
import type { EventSetup, SetupSection } from '@/lib/event-setup';

export function SetupGuide({ setup, onSelect, onPublish }: {
  setup: EventSetup;
  onSelect: (section: SetupSection) => void;
  onPublish: () => void;
}) {
  const next = setup.checks.find(check => check.required && !check.complete)
    ?? setup.checks.find(check => check.attention)
    ?? setup.checks.find(check => !check.complete);
  return <section className="platform-card setup-guide" aria-labelledby="setup-guide-title">
    <div className="setup-guide-header">
      <div><p className="platform-eyebrow">FROM FIRST DETAILS TO OPENING DAY</p><h2 id="setup-guide-title">Your event setup guide</h2>
        <p>Start wherever you need. Progress comes from your saved content, so you can leave and pick it up later.</p></div>
      <div className="setup-progress"><strong>{setup.completed} of {setup.total}</strong><span>setup checks complete</span>
        <progress aria-label="Event setup progress" value={setup.completed} max={setup.total} /></div>
    </div>
    <div className="setup-next">
      <div><strong>{setup.canPublish ? 'Your required event details are ready.' : 'Add your event dates to unlock publishing.'}</strong>
        <p>Branding and content suggestions are optional. Review the sections that apply to your event.</p></div>
      <div className="platform-actions">{next && <button type="button" onClick={() => onSelect(next.section)}>{next.action} →</button>}
        <button className="platform-primary" type="button" onClick={onPublish}>Review & publish</button></div>
    </div>
    <div className="setup-checks">{setup.checks.map(check => <article className={`setup-check ${check.complete ? 'complete' : check.attention ? 'attention' : ''}`} key={check.id} aria-labelledby={`setup-${check.id}`}>
      <div className="setup-check-heading"><h3 id={`setup-${check.id}`}>{check.title}</h3><span className="platform-status">{check.complete ? 'Ready' : check.required ? 'Required' : check.attention ? 'Review content' : 'Optional'}</span></div>
      <p>{check.description}</p><button type="button" onClick={() => onSelect(check.section)}>{check.action}</button>
    </article>)}</div>
  </section>;
}

export function LaunchReview({ setup, onSelect }: { setup: EventSetup; onSelect: (section: SetupSection) => void }) {
  const attention = setup.checks.filter(check => check.attention);
  return <div className="setup-launch-review" aria-label="Launch review"><h3>Before you share the link</h3>
    <p>{setup.canPublish ? 'Required event dates are saved.' : 'Save the first and last event dates before publishing.'} Only content marked Published appears in the guide.</p>
    {attention.length > 0 && <div className="setup-review-items">{attention.map(check => <div key={check.id}><p><strong>{check.title}: </strong>{check.description}</p><button type="button" onClick={() => onSelect(check.section)}>{check.action}</button></div>)}</div>}
    <p className="platform-fine">Preview the actual guide before sharing. Missing optional sections do not prevent publication.</p>
  </div>;
}
