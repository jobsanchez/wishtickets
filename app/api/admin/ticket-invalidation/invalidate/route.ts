import { NextRequest } from "next/server";
import { adminTicketsInvalidatePost } from "@/lib/admin/tickets-invalidate-post";

export async function POST(request: NextRequest) {
  return adminTicketsInvalidatePost(request);
}
