import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground text-sm">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        href="/"
        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}
