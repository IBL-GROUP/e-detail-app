/**
 * One patient this device recorded, kept whether or not it has reached the
 * server.
 *
 * Calls need TWO structures — an outbox that is emptied on upload, and a ledger
 * that outlives it so the month's figures can still be computed offline. A
 * patient needs only one: it is a single-phase insert with nothing to aggregate,
 * so the same row serves as both the queue (`synced_at IS NULL` = still to
 * send) and the durable local copy the list renders before a refetch brings the
 * server's version back.
 */
export interface PatientOutboxRow {
  /** The patient's stable client id — the same key the server upserts on. */
  client_patient_id: string;
  /** JSON-serialized PatientLogInput. */
  payload: string;
  /** When this device recorded the patient (ISO). */
  recorded_at: string;
  /** When the server accepted it (ISO), or null while it is still only local. */
  synced_at: string | null;
  /** Failed flush attempts, used to give up on a row the server keeps refusing. */
  attempts: number;
  last_error: string | null;
}
