import { Card, CardContent, CardHeader, CardTitle, Metric } from '@xb/ui';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of operational health across workspaces.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric label="Revenue (30d)" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Ad spend (30d)" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Units sold" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric label="Stock cover" value="—" hint="awaiting engine output" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation phase</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Business logic engines are intentionally not implemented in this phase. This dashboard
            renders the layout, theme, and component primitives only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
