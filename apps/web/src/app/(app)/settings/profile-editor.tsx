"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { saveProfile, type ProfileFormState } from "./actions";

export interface TemplateOption {
  id: string;
  title: string;
  text: string;
}

/**
 * Copies the interview prompt: pasted into an AI assistant, it asks the user about their search
 * and writes the profile for them.
 */
function CopyPromptButton({ prompt }: { prompt: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      // Missing outside a secure context (plain http on a LAN address).
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({ message: t("settings.profile.promptCopied") });
    } catch {
      toast({ message: t("settings.profile.promptCopyFailed"), tone: "error" });
    }
  };

  return (
    <div className="bg-code grid gap-2 rounded-md border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("settings.profile.promptHelp")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void copy()}
        className="justify-self-start"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("common.copied") : t("settings.profile.copyPrompt")}
      </Button>
    </div>
  );
}

/**
 * YAML editor of the signed-in user's profile. Saving validates on the server (YAML, schema,
 * every pattern); the worker rescores this user within a minute. While the rescore is pending
 * the page refreshes itself to show when the new scores are in.
 */
export function ProfileEditor({
  initial,
  templates,
  prompt,
  rescoring,
}: {
  initial: string;
  templates: TemplateOption[];
  /** The interview prompt to copy; null hides the button. */
  prompt: string | null;
  rescoring: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});
  const dirty = text !== initial;
  const t = useT();

  useEffect(() => {
    if (!rescoring) return;
    const timer = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(timer);
  }, [rescoring, router]);

  return (
    <form action={action} className="mt-3 grid gap-2">
      {prompt ? <CopyPromptButton prompt={prompt} /> : null}
      {templates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="profile-template" className="text-muted-foreground text-xs">
            {t("settings.profile.fromTemplate")}
          </label>
          <Select
            id="profile-template"
            value=""
            onChange={(e) => {
              const tpl = templates.find((x) => x.id === e.target.value);
              if (!tpl) return;
              if (text.trim() && !window.confirm(t("settings.profile.replaceConfirm"))) return;
              setText(tpl.text);
            }}
            className="h-7 text-xs"
          >
            <option value="">{t("settings.profile.choose")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
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
        aria-label={t("settings.profile.yamlLabel")}
        aria-invalid={state.errors?.length ? true : undefined}
        aria-describedby={state.errors?.length ? "profile-errors" : undefined}
        placeholder={t("settings.profile.placeholder")}
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
          {pending ? t("settings.profile.checking") : t("settings.profile.save")}
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(initial)}>
            {t("settings.profile.discard")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
