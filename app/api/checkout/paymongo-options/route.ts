import { NextResponse } from "next/server";
import { getEnabledPaymongoMethods, getPaymongoProcessingFees } from "@/lib/paymongo-config";
import {
  PAYMONGO_BUCKET_LABELS,
  PAYMONGO_PAYMENT_BUCKETS,
  resolvePaymongoMethodsForBucket,
  serializePaymongoProcessingFees,
} from "@/lib/paymongo-processing-fees";

/** Public: enabled PayMongo rails, surcharge config (JSON-safe), and which buyer buckets are usable. */
export async function GET() {
  const [enabledMethods, fees] = await Promise.all([
    getEnabledPaymongoMethods(),
    getPaymongoProcessingFees(),
  ]);
  const buckets = PAYMONGO_PAYMENT_BUCKETS.map((id) => ({
    id,
    label: PAYMONGO_BUCKET_LABELS[id],
    available: resolvePaymongoMethodsForBucket(id, enabledMethods).length > 0,
  }));
  return NextResponse.json({
    enabled_methods: enabledMethods,
    configured_methods: enabledMethods,
    fees: serializePaymongoProcessingFees(fees),
    buckets,
  });
}
