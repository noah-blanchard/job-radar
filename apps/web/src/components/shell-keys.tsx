"use client";

import { useCallback, useState } from "react";
import { CommandPalette, useGoChords } from "@/components/command-palette";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/toast";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Trier",
    keys: [
      ["j / k", "offre suivante / précédente"],
      ["s", "sauvegarder"],
      ["a", "postulé"],
      ["x", "ignorer"],
      ["z", "annuler la dernière action"],
      ["o", "ouvrir l'offre d'origine"],
      ["↵", "ouvrir la fiche"],
      ["e", "écrire une note"],
      ["f", "date de relance"],
      ["/", "rechercher"],
    ],
  },
  {
    title: "Pipeline",
    keys: [
      ["j / k", "carte suivante / précédente"],
      ["h / l", "colonne précédente / suivante"],
      ["1 – 4", "déplacer vers une colonne"],
      ["↵", "ouvrir la fiche"],
    ],
  },
  {
    title: "Partout",
    keys: [
      ["Ctrl K", "aller à une page, une vue, une offre"],
      ["g t", "Trier"],
      ["g p", "Pipeline"],
      ["g s · g e · g x · g r", "Sources · Entreprises · Stats · Réglages"],
      ["?", "cette aide"],
    ],
  },
];

/** Global keyboard layer of the shell: palette, `g` chords, help sheet, toast region. */
export function ShellKeys() {
  const [help, setHelp] = useState(false);
  const toggle = useCallback(() => setHelp((h) => !h), []);
  useGoChords(toggle);
  return (
    <>
      <CommandPalette />
      <Toaster />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-32px))] p-5">
          <DialogTitle className="mb-4 text-sm font-semibold">Raccourcis clavier</DialogTitle>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title} className={g.title === "Trier" ? "sm:row-span-2" : ""}>
                <h3 className="label-caps mb-1.5">{g.title}</h3>
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
                      <dd className="text-muted-foreground">{v}</dd>
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
