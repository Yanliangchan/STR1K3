"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install STR1K3" — native prompt where supported, Add-to-Home-Screen steps on iPhone. */
export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (standalone || (!evt && !ios)) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="install-app">
      <Download className="h-5 w-5 text-navy-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">Install STR1K3 on this device</p>
        <p className="text-sm text-slate-600">
          {ios ? (
            <>
              Tap <Share className="inline h-4 w-4" aria-label="Share" /> then <strong>Add to Home Screen</strong>. It opens full screen like an app.
            </>
          ) : (
            "Opens full screen from your home screen, like an app."
          )}
        </p>
      </div>
      {evt && (
        <Button
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice.catch(() => undefined);
            setEvt(null);
          }}
        >
          Install
        </Button>
      )}
    </Card>
  );
}
