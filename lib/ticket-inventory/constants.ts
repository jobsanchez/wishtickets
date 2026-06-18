/** Seats ensured per `batch: true` ticket-inventory generate request. */
export const TICKET_INVENTORY_ENSURE_SEAT_BATCH = 50;

/** Ticket images rendered per batch request in Seat Configurator. */
export const TICKET_INVENTORY_IMAGE_BATCH_SIZE = 32;

/** Parallel section workers in Seat Configurator ticket generation (each section batches sequentially). */
export const TICKET_INVENTORY_SECTION_WORKERS = 2;

export const TICKET_INVENTORY_MAX_BATCH_ATTEMPTS = 500;
export const TICKET_INVENTORY_MAX_CONSECUTIVE_IDLE = 45;
export const TICKET_INVENTORY_MAX_CONSECUTIVE_ERRORS = 25;
export const TICKET_INVENTORY_BATCH_SUCCESS_DELAY_MS = 300;
