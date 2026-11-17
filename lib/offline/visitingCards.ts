import { Platform } from 'react-native';

import axios from '@/config/axios';
import { isLocalAttachment, toDataUrl } from './patientAttachments';

/** Longest side of a visiting card photo kept on web — plenty to read a card. */
const WEB_MAX_SIDE = 1280;
const WEB_JPEG_QUALITY = 0.7;
/** Data URLs smaller than this are left alone. */
const WEB_SHRINK_ABOVE = 400_000;

/**
 * Web only: shrink a visiting-card photo (as a data URL) to at most 1280px on
 * its longest side, as JPEG.
 *
 * On web the photo has to live in localStorage — in the draft and in the
 * profile queue — and the browser allows only about 5 MB per site. The web
 * image picker ignores `quality`, so a camera photo arrived at full size and
 * one card could fill the whole store: Save then failed with "this browser's
 * storage is full". Shrunk, a card is typically 150–300 KB.
 *
 * Returns the input unchanged on native, when it's already small, or if the
 * browser can't decode it (better a big photo than none).
 */
export async function shrinkCardForWeb(dataUrl: string): Promise<string> {
  if (Platform.OS !== 'web' || !dataUrl.startsWith('data:') || dataUrl.length < WEB_SHRINK_ABOVE) {
    return dataUrl;
  }
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode the photo'));
      element.src = dataUrl;
    });
    const scale = Math.min(1, WEB_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return dataUrl;
    // JPEG has no transparency — paint white first so a PNG card stays readable.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const shrunk = canvas.toDataURL('image/jpeg', WEB_JPEG_QUALITY);
    return shrunk.length < dataUrl.length ? shrunk : dataUrl;
  } catch (error) {
    console.warn('[visiting-card] could not shrink the photo', error);
    return dataUrl;
  }
}

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
