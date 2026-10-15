"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commitImportAction, previewImportAction } from "@/app/actions/data";
import type { ImportPreview } from "@/server/services/importExport";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { cn, pluralize } from "@/lib/utils";

export function ImportForm({ batchId, batchName }: { batchId: string; batchName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [createMissingBytes, setCreate] = useState(false);
  const [includeDuplicates, setInclude] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "preview" | "commit">(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 1_000_000) {
      setError("The file is too large (max 1 MB).");
      return;
    }
    setText(await f.text());
    setPreview(null);
  }

  async function doPreview(opts = { createMissingBytes, includeDuplicates }) {
    setPending("preview");
    setError(null);
    try {
      const res = await previewImportAction({ batchId, csvText: text, ...opts });
      if (!res.ok) setError(res.error);
      else setPreview(res.data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function commit() {
    setPending("commit");
    setError(null);
    try {
      const res = await commitImportAction({ batchId, csvText: text, createMissingBytes, includeDuplicates });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast("success", `Imported ${pluralize(res.data.created, "cadet")} into ${batchName}.`);
      router.push(`/batches/${batchId}`);
    } catch {
      setError("Could not reach the server. Nothing was imported.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <p className="text-sm text-slate-700">
          The first row must be a header. Columns: <code className="rounded bg-slate-100 px-1">name</code> (required),{" "}
          <code className="rounded bg-slate-100 px-1">byte</code> and <code className="rounded bg-slate-100 px-1">notes</code> (optional).
          Existing cadets are never changed by an import.
        </p>
        <label className="block text-sm font-medium text-slate-800">
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="mt-1.5 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-navy-50 file:px-4 file:font-medium file:text-navy-800" />
        </label>
        <Field label="…or paste CSV">
          {(p) => (
            <Textarea
              {...p}
              rows={6}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
              placeholder={"name,byte\nAlex Example,Byte 1"}
              className="font-mono text-sm"
            />
          )}
        </Field>
        <div className="space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={createMissingBytes}
              onChange={(e) => {
                setCreate(e.target.checked);
                if (preview) doPreview({ createMissingBytes: e.target.checked, includeDuplicates });
              }}
            />
            Create bytes that don&apos;t exist yet
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={includeDuplicates}
              onChange={(e) => {
                setInclude(e.target.checked);
                if (preview) doPreview({ createMissingBytes, includeDuplicates: e.target.checked });
              }}
            />
            Also import rows whose name matches an existing cadet (names may legitimately repeat)
          </label>
        </div>
        <Button onClick={() => doPreview()} disabled={!text.trim()} loading={pending === "preview"}>
          Preview
        </Button>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {preview && (
        <Card className="p-4">
          {preview.headerError ? (
            <Alert tone="error">{preview.headerError}</Alert>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-sm">
                <Badge tone="green">{preview.importable} will be imported</Badge>
                {preview.errorCount > 0 && <Badge tone="red">{preview.errorCount} with errors</Badge>}
                {preview.warningCount > 0 && <Badge tone="amber">{preview.warningCount} possible duplicates</Badge>}
                {preview.newBytes.length > 0 && <Badge tone="navy">New bytes: {preview.newBytes.join(", ")}</Badge>}
              </div>
              <div className="max-h-[50dvh] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Row</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Byte</th>
                      <th className="px-2 py-2">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r) => (
                      <tr key={r.line} className={cn(r.errors.length ? "bg-red-50" : r.warnings.length ? "bg-amber-50" : "")}>
                        <td className="px-2 py-1.5 tabular-nums text-slate-500">{r.line}</td>
                        <td className="px-2 py-1.5">{r.name || <em className="text-slate-400">blank</em>}</td>
                        <td className="px-2 py-1.5">
                          {r.byte || "—"}
                          {r.willCreateByte && <span className="text-xs text-navy-700"> (new)</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {[...r.errors, ...r.warnings].join(" ") || <span className="text-emerald-700">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                {preview.errorCount > 0 ? (
                  <Alert tone="error">Fix the rows marked in red, then preview again. Nothing has been imported.</Alert>
                ) : (
                  <Button onClick={commit} loading={pending === "commit"} disabled={preview.importable === 0}>
                    Import {pluralize(preview.importable, "cadet")} into {batchName}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
