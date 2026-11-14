"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { saveProfile, type ProfileFormState } from "./actions";

export interface TemplateOption {
  id: string;
  title: string;
  text: string;
}

/**
 * YAML editor of the signed-in user's profile. Saving validates on the server (YAML, schema,
 * every pattern); the worker rescores this user within a minute. While the rescore is pending
 * the page refreshes itself to show when the new scores are in.
 */
export function ProfileEditor({
  initial,
  templates,
  rescoring,
}: {
  initial: string;
  templates: TemplateOption[];
  rescoring: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});
  const dirty = text !== initial;

  useEffect(() => {
    if (!rescoring) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [rescoring, router]);

  return (
    <form action={action} className="mt-3 grid gap-2">
      {templates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="profile-template" className="text-muted-foreground text-xs">
            Partir d&apos;un modèle
          </label>
          <Select
            id="profile-template"
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (!t) return;
              if (text.trim() && !window.confirm("Remplacer le profil affiché par ce modèle ?"))
                return;
              setText(t.text);
            }}
            className="h-7 text-xs"
          >
            <option value="">choisir…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <textarea
        name="profile"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={22}
        aria-label="Profil (YAML)"
        aria-invalid={state.errors?.length ? true : undefined}
        aria-describedby={state.errors?.length ? "profile-errors" : undefined}
        placeholder="Choisis un modèle ci-dessus, puis adapte les lieux et les mots-clés."
        className="border-input placeholder:text-muted-foreground bg-code block w-full resize-y rounded-md border px-3 py-2 font-mono text-xs leading-relaxed outline-none hover:border-input-hover focus-visible:border-primary/70 focus-visible:outline-none aria-invalid:border-destructive"
      />
      {state.errors?.length ? (
        <ul id="profile-errors" role="alert" className="text-destructive grid gap-1 text-[13px]">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : state.ok && !dirty ? (
        <p className="text-success text-[13px]">{state.ok}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !dirty || !text.trim()}>
          {pending ? "Vérification…" : "Enregistrer le profil"}
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(initial)}>
            Annuler les modifications
          </Button>
        ) : null}
      </div>
    </form>
  );
}
