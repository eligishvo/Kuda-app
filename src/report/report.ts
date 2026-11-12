// "Report a problem": builds a ticket from what the user wrote and sends it to the High Command relay,
// which files it as a ticket labelled app:kuda. The relay holds the GitHub key, so nothing secret ships
// in this app. Same payload as Mechanoplanner's src/report/report.ts (without screenshots for now).
// Kept free of React so it can be tested.
import { APP_ID } from '../config';

export const LIMITS = { title: 120, details: 4000 };

export type ReportInput = { title: string; details: string };

export type ReportContext = {
  /** The screen's route, e.g. /settings */
  screen: string;
  /** The same in plain words, and the taps that lead there. */
  where?: string;
  steps?: string[];
  version: string;
  updateId?: string | null;
  platform: string;
};

export type ReportPayload = ReportInput & ReportContext & { app: string };

/** What's wrong with the form, or null when it can be sent. */
export function checkReport(input: ReportInput): string | null {
  if (input.title.trim().length < 3) return 'Give the problem a short title.';
  if (input.title.trim().length > LIMITS.title) return `Keep the title under ${LIMITS.title} characters.`;
  if (input.details.length > LIMITS.details) return `Keep the details under ${LIMITS.details} characters.`;
  return null;
}

export function buildReport(input: ReportInput, ctx: ReportContext): ReportPayload {
  return {
    app: APP_ID,
    title: input.title.trim().replace(/\s+/g, ' '),
    details: input.details.trim(),
    screen: ctx.screen || '/',
    where: ctx.where,
    steps: ctx.steps,
    version: ctx.version,
    updateId: ctx.updateId ?? null,
    platform: ctx.platform,
  };
}

export type SendResult = { ok: true; ticket?: number } | { ok: false; error: string };

/** Posts the report to the relay. Never throws. */
export async function sendReport(url: string, payload: ReportPayload, fetchFn: typeof fetch = fetch): Promise<SendResult> {
  try {
    const res = await fetchFn(`${url.replace(/\/+$/, '')}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { ticket?: number; error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `The server answered ${res.status}. Try again later.` };
    return { ok: true, ticket: body.ticket };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** What a report collects and where it goes (shown under the form). */
export const REPORT_PRIVACY =
  'Your report is stored in our issue tracker (GitHub) only to fix the problem, together with the app version and the platform (e.g. Android). Nothing else is collected.';

/** A screen's route in plain words, for the ticket ("/results" → "Results list"). */
export function whereOf(route: string): string {
  const names: Record<string, string> = {
    '/': 'Map',
    '/search': 'Search flights',
    '/results': 'Results list',
    '/destination': 'Destination (live flights)',
    '/planner': 'Planner',
    '/settings': 'Settings',
    '/debug': 'Flight data (debug)',
  };
  const path = (route.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  return names[path] ?? path;
}
