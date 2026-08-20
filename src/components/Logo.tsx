import logoUrl from "@/assets/dotpesa-logo.svg";

export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src={logoUrl} alt="dotPesa" className={className} />
    </span>
  );
}
