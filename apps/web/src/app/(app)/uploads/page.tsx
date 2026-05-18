import { ModulePlaceholder } from '@/components/module-placeholder';

export default function UploadsPage() {
  return (
    <ModulePlaceholder
      title="Uploads"
      description="Raw data ingestion. All uploads land in GCS and feed the canonical pipeline."
    />
  );
}
