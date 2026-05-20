import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { Protected } from '@/components/protected';

/**
 * App shell with an independently scrolling `<main>`.
 *
 *   h-screen + overflow-hidden on the outer → page never scrolls
 *   flex-1   + overflow-auto   on <main>    → scroll happens inside main
 *
 * That makes <main> the nearest scrolling ancestor for any
 * `sticky top-0` element inside page content — page-level toolbars
 * (Settings header, filters) pin to the top of the visible area as the
 * org list scrolls beneath them. With min-h-screen on the outer the
 * document itself would scroll, making sticky inside main meaningless
 * (the sticky element would move with the page).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </Protected>
  );
}
