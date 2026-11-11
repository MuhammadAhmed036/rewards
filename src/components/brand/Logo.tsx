import React from "react";
import Image from "next/image";
import Link from "next/link";

/** The R from the Rappio logo on its own: app icon, small headers, loading states. */
export function LogoMark({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <Image
      src="/brand/rappio-mark.png"
      alt=""
      width={355}
      height={371}
      className={`${className} object-contain`}
      aria-hidden
      priority
    />
  );
}

/**
 * The full Rappio logo. `tone="light"` is the white-wordmark version for dark backgrounds.
 * Height is set by className (default h-8); the width follows.
 */
export function Logo({
  href = "/",
  tone = "dark",
  className = "h-8",
}: {
  href?: string | null;
  tone?: "dark" | "light";
  className?: string;
}) {
  const image = (
    <Image
      src={tone === "light" ? "/brand/rappio-logo-light.png" : "/brand/rappio-logo.png"}
      alt="Rappio"
      width={1222}
      height={370}
      className={`${className} w-auto`}
      priority
    />
  );
  if (href === null) return image;
  return (
    <Link href={href} className="inline-flex items-center shrink-0 rounded-lg" aria-label="Rappio home">
      {image}
    </Link>
  );
}
