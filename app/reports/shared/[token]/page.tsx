import type { Metadata } from "next";
import { getServerClientIfAvailable } from "@/lib/supabase/server";
import { SharedReportClient } from "./shared-report-client";

type PageContext = {
  params: Promise<{ token: string }>;
};

function formatGeneratedLabel(dateIso: string): string {
  return new Date(dateIso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function generateMetadata(context: PageContext): Promise<Metadata> {
  const { token } = await context.params;
  const supabase = await getServerClientIfAvailable();
  if (!supabase) {
    return {
      title: "Shared Report",
      description: "Shared event sales report",
    };
  }
  const { data } = await supabase
    .from("shared_report_links")
    .select("created_at, events!inner(title)")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  const typedData = data as
    | { created_at: string; events: Array<{ title: string | null }> }
    | null;
  const eventTitle = typedData?.events?.[0]?.title ?? null;
  const title =
    typedData && eventTitle
      ? `${eventTitle} - ${formatGeneratedLabel(typedData.created_at)}`
      : "Shared Report";

  return {
    title,
    description: "Shared event sales report",
  };
}

export default async function SharedReportPage(context: PageContext) {
  const { token } = await context.params;
  return <SharedReportClient token={token} />;
}
