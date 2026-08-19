export function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

export function formValue(form: HTMLFormElement, field: string): string {
  return String(new FormData(form).get(field) || '');
}

// Captures the submitted <form> synchronously, the instant the `submit`
// event fires, and hands it to `action`. This MUST happen before any
// re-render runs (re-rendering replaces #app's innerHTML, including the
// <form> itself, with a fresh empty one) — otherwise later code that looks
// the form back up by id silently reads empty values. See the postmortem
// in CLAUDE.md ("login form sends empty username/password").
export function onFormSubmit(formId: string, action: (form: HTMLFormElement) => void): void {
  document.getElementById(formId)?.addEventListener('submit', (e) => {
    e.preventDefault();
    action(e.target as HTMLFormElement);
  });
}
