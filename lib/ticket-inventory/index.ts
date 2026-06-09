export type {
  AllocateInventoryResult,
  EnsureInventoryResult,
  InventoryRow,
  SectionInventorySummary,
} from "@/lib/ticket-inventory/types";
export { TicketInventoryError } from "@/lib/ticket-inventory/types";

export {
  ensureInventoryForSeats,
  ensureInventoryForSections,
} from "@/lib/ticket-inventory/ensure-inventory";

export {
  generateInventoryImages,
  type GenerateInventoryImagesResult,
} from "@/lib/ticket-inventory/generate-images";

export {
  deleteInventoryForSections,
  type DeleteInventoryResult,
} from "@/lib/ticket-inventory/delete-inventory";

export {
  clearInventoryAllocation,
  clearInventoryAllocationForTicket,
  eventRequiresTicketInventory,
  getNextUnallocatedInventoryForSection,
  getUnallocatedInventoryForSeat,
  markInventoryAllocated,
  finalizeInventoryAllocationsForSaleTickets,
} from "@/lib/ticket-inventory/allocate";

export {
  getEventInventorySummaries,
  sectionHasAllocatedInventory,
} from "@/lib/ticket-inventory/summary";

export {
  buildSeatSaleTicket,
  buildSectionSaleTicket,
  type SaleTicketRow,
} from "@/lib/ticket-inventory/build-sale-ticket";

export { resolveTicketImageUrl } from "@/lib/ticket-inventory/resolve-ticket-image";
