import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import axios from '@/config/axios';

/**
 * Patient images, from the moment they are picked to the moment the server has
 * them.
 *
 * A rep photographs a prescription in a clinic with no signal, so the image
 * cannot go straight to the server. It is copied into the app's DOCUMENT
 * directory first — the picker hands back a URI in the cache directory, which
 * the OS is free to clear whenever it likes — and the local URI travels in the
 * queued patient payload. On flush each one is uploaded and swapped for the
 * server path that goes into patient_log.attachment.
 */

const ATTACHMENTS_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}patient-attachments/`
  : null;

/** A path already on the server needs no upload; a local file does. */
export function isLocalAttachment(uri: string): boolean {
  const value = String(uri ?? '').trim();
  if (!value) return false;
  return !/^https?:\/\//i.test(value) && !value.startsWith('/uploads/');
}

async function ensureDir(): Promise<void> {
  if (!ATTACHMENTS_DIR) return;
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
}

function extensionOf(uri: string): string {
  const match = uri.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * Copy a just-picked image somewhere it will survive.
 *
 * Returns the durable URI, or the original one when there is no file system to
 * copy into (web), where the blob URL is already usable for the session.
 */
export async function persistPickedImage(uri: string): Promise<string> {
  if (Platform.OS === 'web' || !ATTACHMENTS_DIR) {
    // On web the picker returns a blob: URL from URL.createObjectURL, which is
    // scoped to the page: it dies on reload, and expo-file-system cannot open
    // it at all. Re-encode it as a data URL so the queued payload is
    // self-contained and still uploadable after a refresh.
    return toDataUrl(uri);
  }

  try {
    await ensureDir();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(uri)}`;
    const target = `${ATTACHMENTS_DIR}${name}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  } catch (error) {
    console.warn('[attachments] failed to persist picked image', error);
    // Better to carry the cache URI than to lose the rep's photo outright — it
    // usually survives long enough to upload.
    return uri;
  }
}

/**
 * Read any picked image into a `data:<mime>;base64,...` URL — the one shape the
 * upload endpoint accepts.
 *
 * Three sources, and they are genuinely different:
 *  - already a data URL   -> nothing to do
 *  - a blob: URL (web)    -> fetch it back out of the browser and re-encode.
 *                            expo-file-system cannot open these, which is what
 *                            silently blocked every web upload.
 *  - a file: URI (native) -> read straight off disk as base64.
 */
async function toDataUrl(uri: string): Promise<string> {
  const value = String(uri ?? '');
  if (value.startsWith('data:')) return value;

  if (Platform.OS === 'web' || value.startsWith('blob:')) {
    const blob = await (await fetch(value)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error('Could not read the selected image.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }

  const ext = extensionOf(value);
  const mime = MIME_BY_EXT[ext] ?? 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(value, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mime};base64,${base64}`;
}

/** Delete a local copy the rep removed from the form before saving. */
export async function discardLocalAttachment(uri: string): Promise<void> {
  if (Platform.OS === 'web' || !isLocalAttachment(uri)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // housekeeping only — a stray file is harmless
  }
}

/**
 * A photo is far bigger than any other request this app makes, and base64
 * inflates it by a third again. The shared axios instance times out at 30s,
 * which a rep on a weak clinic connection can exceed on a single image — and a
 * timeout here holds the whole patient back. Given its own budget, as the sales
 * summary does for its long query.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

interface UploadResponse {
  success: boolean;
  fileName: string;
  /** The relative path to persist: /uploads/... */
  storageUrl: string;
  url: string;
}

/**
 * Upload one local image and return the server path to store.
 *
 * Sent as a base64 data URL, which is what the backend accepts and what the
 * admin console's uploader already does. Throws on failure so the caller can
 * keep the row queued and retry — a patient must never be filed with a
 * half-uploaded image list.
 */
export async function uploadAttachment(localUri: string): Promise<string> {
  // Handles all three shapes — data:, blob: (web) and file: (native).
  const dataUrl = await toDataUrl(localUri);

  const response = (await axios.post(
    '/patients/attachments',
    {
      // A data: or blob: URI carries no filename; the server names it instead.
      fileName: /^(data|blob):/.test(localUri)
        ? 'prescription'
        : (localUri.split('/').pop() ?? 'prescription'),
      dataUrl,
    },
    { timeout: UPLOAD_TIMEOUT_MS },
  )) as unknown as UploadResponse;

  if (!response?.storageUrl) {
    throw new Error('Attachment upload did not return a path');
  }
  return response.storageUrl;
}

/**
 * Resolve a patient's image list to server paths, uploading whatever is still
 * local. Anything already on the server is passed through untouched, so a retried
 * flush re-uploads nothing.
 */
export async function uploadPendingAttachments(
  attachments: string[] | undefined,
): Promise<string[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const resolved: string[] = [];
  for (const uri of attachments) {
    const value = String(uri ?? '').trim();
    if (!value) continue;
    resolved.push(isLocalAttachment(value) ? await uploadAttachment(value) : value);
  }
  return resolved;
}

/**
 * Remove the local copies of images that have been uploaded. Called once the
 * server has the patient, so the device isn't left holding every photo a rep
 * has ever taken.
 */
export async function cleanUpLocalAttachments(
  attachments: string[] | undefined,
): Promise<void> {
  for (const uri of attachments ?? []) {
    await discardLocalAttachment(String(uri ?? ''));
  }
}
