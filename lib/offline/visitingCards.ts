import axios from '@/config/axios';
import { isLocalAttachment, toDataUrl } from './patientAttachments';

/**
 * Visiting-card photos, from the camera to the server.
 *
 * The same journey a prescription photo takes (see patientAttachments): copied
 * somewhere durable when picked, carried as a local URI in the queued profile,
 * and swapped for the server path on flush. Only the upload endpoint differs —
 * a card goes to /doctor-profiles/visiting-card (DOC-FR-012), into its own
 * folder on the server. Persisting and cleaning up the local copy reuse the
 * patient helpers as they are.
 */

/** Same budget as a prescription photo, for the same reason (weak clinic signal). */
const UPLOAD_TIMEOUT_MS = 120_000;

interface UploadResponse {
  success: boolean;
  fileName: string;
  /** The relative path to persist: /uploads/visiting-cards/... */
  storageUrl: string;
  url: string;
}

/**
 * Resolve a profile's visiting card to a server path, uploading it when it is
 * still local. A path already on the server passes straight through, so a
 * retried flush re-uploads nothing. Throws on failure so the profile stays
 * queued — it must never be filed without its card.
 */
export async function uploadPendingVisitingCard(uri: string | undefined): Promise<string> {
  const value = String(uri ?? '').trim();
  if (!value || !isLocalAttachment(value)) return value;

  const dataUrl = await toDataUrl(value);
  const response = (await axios.post(
    '/doctor-profiles/visiting-card',
    {
      fileName: /^(data|blob):/.test(value)
        ? 'visiting-card'
        : (value.split('/').pop() ?? 'visiting-card'),
      dataUrl,
    },
    { timeout: UPLOAD_TIMEOUT_MS },
  )) as unknown as UploadResponse;

  if (!response?.storageUrl) {
    throw new Error('Visiting card upload did not return a path');
  }
  return response.storageUrl;
}
