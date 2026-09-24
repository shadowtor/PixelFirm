// The /ceo dashboard root (D-08). main.tsx loads this module only through a dynamic import,
// so this file, ceo.css (the only Tailwind entry) and every shadcn/Kibo component ship in a
// lazy chunk the office route never requests. 06-14 builds the shell and queue on this root.
import "./ceo.css";

export function CeoApp() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <h1 className="px-4 py-4 text-xl leading-tight font-semibold">CEO desk</h1>
    </div>
  );
}
