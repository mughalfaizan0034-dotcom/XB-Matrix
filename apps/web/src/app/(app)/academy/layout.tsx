import { AcademyShell } from '@/components/academy-shell';

/**
 * Academy route layout. AppShell already omits the main app sidebar
 * for /academy/* routes; this layer drops the AcademyShell in its
 * place (category sidebar + sticky search + reader column).
 */
export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return <AcademyShell>{children}</AcademyShell>;
}
