"use client";

import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3">
      <Alert tone="error" title="Something went wrong loading this page">
        Your saved data is unaffected. Check your connection and try again.
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
