"use client";

import { useState } from "react";
import { signOutOtherDevicesAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SignOutOthers({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  return (
    <Button
      variant="outline"
      disabled={disabled}
      loading={pending}
      onClick={async () => {
        setPending(true);
        const res = await signOutOtherDevicesAction().catch(() => null);
        setPending(false);
        if (res?.ok) {
          toast("success", "Signed out of all other devices.");
        } else toast("error", res && !res.ok ? res.error : "Could not reach the server.");
      }}
    >
      Sign out other devices
    </Button>
  );
}
