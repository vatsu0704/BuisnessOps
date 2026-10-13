import { apiClient } from './client';
import type { InviteLookupResult } from '@/types/team';

/**
 * Whether this email already has a pending invite. Null when it has none (a 404),
 * so sign-up can offer "Join <business>" instead of asking for business details.
 */
export async function lookupInvite(email: string): Promise<InviteLookupResult | null> {
  try {
    const { data } = await apiClient.get<InviteLookupResult>('/invites/lookup', { params: { email } });
    return data;
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null;
    throw err;
  }
}
