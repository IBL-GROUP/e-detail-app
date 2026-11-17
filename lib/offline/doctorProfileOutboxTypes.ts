/**
 * One doctor profile this device captured, kept whether or not it has reached
 * the server — the same single-structure shape as the patient queue: the row
 * is both the queue (`synced_at IS NULL` = still to send) and the durable local
 * copy the list renders until a refetch brings the server's version back.
 */
export interface DoctorProfileOutboxRow {
  /** The profile's stable client id — the key the server upserts on. */
  client_local_id: string;
  /**
   * The signed-in user who captured it. A shared device keeps the previous
   * rep's queue, and "captured" is per rep (DOC-BR-006), so every read filters
   * on it.
   */
  owner_id: string;
  /** JSON-serialized DoctorProfileInput. */
  payload: string;
  /** When this device captured the profile (ISO). */
  recorded_at: string;
  /** When the server accepted it (ISO), or null while it is still only local. */
  synced_at: string | null;
  /** Failed flush attempts, used to give up on a row the server keeps refusing. */
  attempts: number;
  last_error: string | null;
}
