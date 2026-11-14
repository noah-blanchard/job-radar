"use client";

import { useCallback, useState } from "react";
import { CommandPalette, useGoChords } from "@/components/command-palette";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";

// The keys stay the same in every language (muscle memory); only their descriptions change.
const GROUPS: { id: string; title: MessageKey; keys: [string, MessageKey][] }[] = [
  {
    id: "triage",
    title: "keys.triage",
    keys: [
      ["j / k", "keys.nextPrevOffer"],
      ["s", "keys.save"],
      ["a", "keys.applied"],
      ["x", "keys.ignore"],
      ["z", "keys.undo"],
      ["o", "keys.openOrigin"],
      ["↵", "keys.openDetail"],
      ["e", "keys.note"],
      ["f", "keys.followUp"],
      ["/", "keys.search"],
    ],
  },
  {
    id: "pipeline",
    title: "keys.pipeline",
    keys: [
      ["j / k", "keys.nextPrevCard"],
      ["h / l", "keys.prevNextColumn"],
      ["1 – 4", "keys.moveToColumn"],
      ["↵", "keys.openDetail"],
    ],
  },
  {
    id: "everywhere",
    title: "keys.everywhere",
    keys: [
      ["Ctrl K", "keys.palette"],
      ["g t", "nav.triage"],
      ["g p", "nav.pipeline"],
      ["g s · g e · g x · g r", "keys.machinePages"],
      ["?", "keys.help"],
    ],
  },
];

/** Global keyboard layer of the shell: palette, `g` chords, help sheet, toast region. */
export function ShellKeys() {
  const [help, setHelp] = useState(false);
  const toggle = useCallback(() => setHelp((h) => !h), []);
  const t = useT();
  useGoChords(toggle);
  return (
    <>
      <CommandPalette />
      <Toaster />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-32px))] p-5">
          <DialogTitle className="mb-4 text-sm font-semibold">{t("keys.title")}</DialogTitle>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.id} className={g.id === "triage" ? "sm:row-span-2" : ""}>
                <h3 className="label-caps mb-1.5">{t(g.title)}</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                  {g.keys.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="flex gap-1">
                        {k.split(" ").map((p, i) =>
                          p === "/" || p === "·" || p === "–" ? (
                            <span key={i} className="text-muted-foreground">
                              {p}
                            </span>
                          ) : (
                            <Kbd key={i}>{p}</Kbd>
                          ),
                        )}
                      </dt>
                      <dd className="text-muted-foreground">{t(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
