import { Protected } from '@/components/protected';
import { AppShell } from '@/components/app-shell';

/**
 * Authenticated route shell. `Protected` gates on the session;
 * `AppShell` renders the sidebar + topbar chrome (and hides it on the
 * workspace picker). Both are client components; the layout itself
 * stays a server component.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <AppShell>{children}</AppShell>
    </Protected>
  );
}
