/**
 * Minimal inline markup for interface strings that need emphasis: `**bold**` and `` `code` ``.
 * Keeps the dictionaries plain text (no HTML) while letting a paragraph highlight a few words.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <b key={i} className="text-foreground">
            {p.slice(2, -2)}
          </b>
        ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="text-foreground">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}
