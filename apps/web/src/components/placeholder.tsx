/** One-line page header: title, a short hint, and an optional slot on the right. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-1 border-b px-4 pt-4 pb-3 md:px-6">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {description ? <p className="text-muted-foreground text-[13px]">{description}</p> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** A page in the shell: fixed header rows on top, then `PageScroll` areas. */
export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

/** The part of a page that scrolls (on its own from md up; with the page on phones). */
export function PageScroll({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`md:min-h-0 md:flex-1 md:overflow-y-auto ${className ?? ""}`}>{children}</div>
  );
}
