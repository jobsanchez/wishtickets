"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const INVALIDATE_DEBOUNCE_MS = 400;

/**
 * Invalidates seat availability when reservation_items change for this event (cart holds).
 * Primary live update path on the book page (with focus/refetch as fallback).
 *
 * Subscribes on the next animation frame so React Strict Mode / Fast Refresh teardown
 * can run first; otherwise the Realtime client often logs a harmless WebSocket warning
 * when the socket is closed before the handshake finishes.
 */
export function useEventAvailabilityRealtime(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!eventId) return;

    const scheduleSeatInvalidation = () => {
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
      invalidateTimerRef.current = setTimeout(() => {
        invalidateTimerRef.current = null;
        void queryClient.invalidateQueries({
          queryKey: ["availability", eventId, "seats"],
        });
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    const rafId = requestAnimationFrame(() => {
      channel = supabase
        .channel(`reservation_items:event:${eventId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reservation_items",
            filter: `event_id=eq.${eventId}`,
          },
          scheduleSeatInvalidation
        )
        .subscribe();
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [eventId, queryClient]);
}
