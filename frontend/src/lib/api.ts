import type {
  CustomFont,
  CustomFontsDocument,
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
  TeamRosterEntry,
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
  // since they take everything from the URL. FormData is left alone so the browser can add the
  // multipart boundary, which it can only do if we have not set the header ourselves.
  if (init?.body !== undefined && init.body !== null && !(init.body instanceof FormData)) {
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

  /**
   * Uploads carry their own multipart boundary, so the content type must be left for the browser to
   * set — declaring JSON here, as every other call does, would corrupt the request.
   */
  uploadTeamLogo: (teamNo: number, file: File) => {
    const body = new FormData();
    body.append('logo', file);
    return request<TeamRosterEntry>(`/teams/${teamNo}/logo`, { method: 'POST', body });
  },

  deleteTeamLogo: (teamNo: number) =>
    request<TeamRosterEntry>(`/teams/${teamNo}/logo`, { method: 'DELETE' }),

  importTeamIni: (file: File) => {
    const body = new FormData();
    body.append('ini', file);
    return request<{
      teams: number;
      logosCopied: number;
      logosMissing: string[];
      namesTruncated: string[];
      document: TeamRosterDocument;
    }>('/teams/import-ini', { method: 'POST', body });
  },

  getFonts: () => request<CustomFontsDocument>('/config/fonts'),

  uploadFont: (file: File) => {
    const body = new FormData();
    body.append('font', file);
    return request<CustomFont>('/config/fonts', { method: 'POST', body });
  },

  deleteFont: (family: string) =>
    request<CustomFontsDocument>(`/config/fonts/${encodeURIComponent(family)}`, {
      method: 'DELETE',
    }),

  getScoring: () => request<ScoringRuleset>('/config/scoring'),
  saveScoring: (ruleset: ScoringRuleset) =>
    request<ScoringRuleset>('/config/scoring', { method: 'PUT', body: JSON.stringify(ruleset) }),

  setOverlayVisibility: (instanceId: string, action: 'show' | 'hide' | 'toggle') =>
    request<{ instanceId: string; visible: boolean; changedAt: number }>(
      `/overlays/${instanceId}/${action}`,
      { method: 'POST' },
    ),
};
