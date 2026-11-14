import type { Metadata } from "next";
import { RadarMark } from "@/components/nav";
import { safeNextPath } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);
  return (
    <main className="flex min-h-dvh">
      <div
        className="bg-rail hidden w-[208px] shrink-0 border-r border-rail-border md:block"
        aria-hidden
      />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[300px]">
          <p className="mb-6 flex items-center gap-2 text-sm font-semibold">
            <RadarMark /> JobRadar
          </p>
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
