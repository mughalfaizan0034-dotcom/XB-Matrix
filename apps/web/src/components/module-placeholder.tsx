import { Card, CardContent } from '@xb/ui';

interface Props {
  readonly title: string;
  readonly description: string;
}

export function ModulePlaceholder({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex h-48 flex-col items-center justify-center gap-2 pt-6 text-center">
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-orange-700">
            Foundation
          </span>
          <p className="text-sm text-muted-foreground">
            Module shell only — engines and data wiring land in a later phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
