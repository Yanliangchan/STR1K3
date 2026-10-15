import { PageHeader } from "@/components/ui/misc";
import { NewBatchForm } from "@/components/batches/new-batch-form";

export const metadata = { title: "New batch" };

export default function NewBatchPage() {
  return (
    <div className="max-w-xl">
      <PageHeader title="New batch" />
      <NewBatchForm />
    </div>
  );
}
