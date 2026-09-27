export function releaseInfo(environment: { revision?: string; demo: boolean; emailReady: boolean }) {
  return {
    application: "event-beast",
    revision: environment.revision && /^[a-f0-9]{40}$/i.test(environment.revision) ? environment.revision : null,
    mode: environment.demo ? "demo" : "live",
    emailSignupOpen: !environment.demo && environment.emailReady,
  };
}
