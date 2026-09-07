/** Nested containers, the product's one recurring symbol. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="6" fill="var(--depth-4)" />
      <rect x="7" y="7" width="18" height="18" rx="4" fill="var(--depth-2)" />
      <rect x="12" y="12" width="8" height="8" rx="2" fill="var(--accent)" />
    </svg>
  );
}
