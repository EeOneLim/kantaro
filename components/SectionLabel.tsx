interface SectionLabelProps {
  children: React.ReactNode;
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}
