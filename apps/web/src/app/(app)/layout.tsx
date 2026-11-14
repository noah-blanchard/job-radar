import { LogOut } from "lucide-react";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { logout } from "../login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="text-sm font-semibold tracking-tight whitespace-nowrap">
            JobRadar
          </Link>
          <Nav />
          <form action={logout} className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
