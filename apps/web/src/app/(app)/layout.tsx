import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { Protected } from '@/components/protected';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </Protected>
  );
}
