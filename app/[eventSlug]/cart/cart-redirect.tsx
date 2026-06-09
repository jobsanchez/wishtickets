"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface CartRedirectProps {
  eventSlug: string;
}

export default function CartRedirect({ eventSlug }: CartRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${eventSlug}/book`);
  }, [eventSlug, router]);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="glass rounded-xl p-8 text-center text-foreground-muted">
        Redirecting to seat selection...
      </div>
    </div>
  );
}
