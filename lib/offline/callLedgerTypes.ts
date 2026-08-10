/**
 * One call this device recorded, kept whether or not it has reached the server.
 *
 * Distinct from an outbox row: the outbox is a QUEUE and its rows are deleted
 * the moment the server accepts them, so it can never answer "what calls has
 * this rep made this month". The ledger is the durable local record that the
 * offline read models are computed from.
 */
export interface CallLedgerRow {
  /** The call's stable client id — the same key the server upserts on. */
  client_call_id: string;
  /** JSON-serialized CallTrackingInput (the latest phase written). */
  payload: string;
  /** When this device first recorded the call (ISO). */
  recorded_at: string;
  /**
   * When the server accepted this exact content (ISO), or null while it is
   * still only local. Compared against a query's fetch time to decide whether a
   * server response already accounts for the call — that comparison is what
   * keeps a synced call from being counted twice.
   */
  synced_at: string | null;
}
