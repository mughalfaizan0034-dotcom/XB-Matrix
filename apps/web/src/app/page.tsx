import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-navy text-white">
          <span className="font-heading text-xl font-bold">xB</span>
        </div>
        <h1 className="font-heading text-5xl font-semibold tracking-tight text-navy">
          xB Matrix
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Enterprise-grade AI-powered commerce intelligence platform.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-navy-700"
        >
          Open dashboard
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
