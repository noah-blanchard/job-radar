export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}

export function ComingSoon({
  title,
  milestone,
  children,
}: {
  title: string;
  milestone: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
        {children ?? "Cette page sera construite plus tard."}{" "}
        <span className="text-foreground/70">(jalon {milestone})</span>
      </div>
    </>
  );
}
