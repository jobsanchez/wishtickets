"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingCartTimer } from "@/components/booking/floating-cart-timer";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname?.startsWith("/reports/shared/") ?? false;

  if (hideChrome) {
    return <main className="flex-1 flex flex-col">{children}</main>;
  }

  return (
    <>
      <Header initialRole={null} />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
      <FloatingCartTimer />
    </>
  );
}
