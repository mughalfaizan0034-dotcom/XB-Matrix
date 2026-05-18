export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xb-md">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auth provider is not wired in the foundation phase.
        </p>
        <form className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              type="email"
              disabled
              placeholder="you@example.com"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Password</span>
            <input
              type="password"
              disabled
              placeholder="••••••••"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            disabled
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
