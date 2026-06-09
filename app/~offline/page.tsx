import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Service worker document fallback (Serwist) when navigation is offline and uncached.
 */
export default function OfflinePlaceholderPage() {
  return (
    <div className="container mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold text-foreground">You are offline</h1>
      <p className="text-foreground-muted text-sm">
        This page is not available yet. Open the site once while online, then return here. For admissions,
        use the admissions area after the app has loaded in this browser.
      </p>
      <Button asChild>
        <Link href="/admissions/login">Admissions staff login</Link>
      </Button>
    </div>
  );
}
