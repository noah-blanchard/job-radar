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
    <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b px-4 pt-4 pb-3 md:px-6">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      {description ? <p className="text-muted-foreground text-[13px]">{description}</p> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Page body with the standard gutters. */
export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`px-4 py-4 md:px-6 md:py-5 ${className ?? ""}`}>{children}</div>;
}
