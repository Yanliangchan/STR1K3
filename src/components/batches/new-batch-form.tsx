"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBatchAction } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function NewBatchForm() {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ name: "", description: "", expectedSize: "30", bytes: "Byte 1\nByte 2\nByte 3" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await createBatchAction({
        name: v.name,
        description: v.description,
        expectedSize: v.expectedSize ? Number(v.expectedSize) : null,
        bytes: v.bytes.split("\n"),
      });
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      toast("success", "Batch created. It is not active until you activate it.");
      router.push(`/batches/${res.data}`);
    } catch {
      setError("Could not reach the server. Nothing was saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <Card className="space-y-4 p-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Batch name" required hint="E.g. 14/26 MDST" error={errors.name}>
          {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} autoFocus />}
        </Field>
        <Field label="Description" error={errors.description}>
          {(p) => <Textarea {...p} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}
        </Field>
        <Field label="Expected number of cadets" hint="For reference only." error={errors.expectedSize}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={v.expectedSize} onChange={(e) => setV({ ...v, expectedSize: e.target.value })} />}
        </Field>
        <Field label="Bytes" hint="One per line. You can add, rename or remove bytes later.">
          {(p) => <Textarea {...p} rows={4} value={v.bytes} onChange={(e) => setV({ ...v, bytes: e.target.value })} />}
        </Field>
        <Alert tone="info">A new batch starts empty and is not activated automatically.</Alert>
        <Button type="submit" loading={pending}>
          Create batch
        </Button>
      </Card>
    </form>
  );
}
