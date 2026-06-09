import { NextRequest } from "next/server";
import { adminTicketsVerifyPost } from "@/lib/admin/tickets-verify-post";

export async function POST(request: NextRequest) {
  return adminTicketsVerifyPost(request);
}
