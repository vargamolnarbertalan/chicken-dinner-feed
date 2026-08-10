import type {
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
} from '@cdf/shared';

/**
 * The admin's view of the backend.
 *
 * Errors carry the server's message rather than a status code: the backend already explains what is
 * wrong in operator language ("Each team number can only appear once"), and re-wording it here would
 * lose that.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  // Only declare a JSON body when there actually is one. Declaring `application/json` on a bodyless
  // POST makes the server reject it as an empty JSON body — which is what the show/hide calls are,
  // since they take everything from the URL.
  if (init?.body !== undefined && init.body !== null) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`/api${path}`, { ...init, headers });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (HTTP ${response.status})`;
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  getOverlays: () => request<OverlayInstancesDocument>('/config/overlays'),

  createOverlay: (body: { id: string; name: string; copyAppearanceFrom?: string }) =>
    request<OverlayInstance>('/config/overlays', { method: 'POST', body: JSON.stringify(body) }),

  updateOverlay: (instance: OverlayInstance) =>
    request<OverlayInstance>(`/config/overlays/${instance.id}`, {
      method: 'PUT',
      body: JSON.stringify(instance),
    }),

  deleteOverlay: (instanceId: string) =>
    request<void>(`/config/overlays/${instanceId}`, { method: 'DELETE' }),

  getTeams: () => request<TeamRosterDocument>('/config/teams'),
  saveTeams: (document: TeamRosterDocument) =>
    request<TeamRosterDocument>('/config/teams', { method: 'PUT', body: JSON.stringify(document) }),

  getScoring: () => request<ScoringRuleset>('/config/scoring'),
  saveScoring: (ruleset: ScoringRuleset) =>
    request<ScoringRuleset>('/config/scoring', { method: 'PUT', body: JSON.stringify(ruleset) }),

  setOverlayVisibility: (instanceId: string, action: 'show' | 'hide' | 'toggle') =>
    request<{ instanceId: string; visible: boolean; changedAt: number }>(
      `/overlays/${instanceId}/${action}`,
      { method: 'POST' },
    ),
};
