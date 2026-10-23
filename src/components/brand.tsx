import Image from "next/image";

type BrandSize = "sm" | "md" | "lg";
type BrandTone = "white" | "blue";
type BrandProps = {
  className?: string;
  size?: BrandSize;
  decorative?: boolean;
};

/** Official artwork, with its original orientation and aspect ratio. */
export function BrandSymbol({
  className = "",
  size = "md",
  decorative = false,
}: BrandProps) {
  return (
    <Image
      src="/brand/symbol.png"
      width={1280}
      height={1280}
      alt={decorative ? "" : "Tasknado"}
      aria-hidden={decorative || undefined}
      className={`brand-symbol brand-symbol--${size} ${className}`}
      unoptimized
      loading="eager"
    />
  );
}

/** A colorable alpha mask preserves the supplied custom lettering. */
export function BrandWordmark({
  className = "",
  size = "md",
  tone = "white",
  decorative = false,
}: BrandProps & { tone?: BrandTone }) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Tasknado"}
      aria-hidden={decorative || undefined}
      className={`brand-wordmark brand-wordmark--${size} brand-wordmark--${tone} ${className}`}
    />
  );
}

export function BrandLogo({
  className = "",
  size = "md",
  tone = "white",
  layout = "horizontal",
}: {
  className?: string;
  size?: BrandSize;
  tone?: BrandTone;
  layout?: "horizontal" | "vertical" | "compact";
}) {
  return (
    <div
      role="img"
      aria-label="Tasknado"
      className={`brand brand--${size} brand--${layout} ${className}`}
    >
      <BrandSymbol size={size} decorative />
      {layout !== "compact" && (
        <BrandWordmark size={size} tone={tone} decorative />
      )}
    </div>
  );
}
