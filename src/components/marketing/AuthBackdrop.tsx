import React from "react";
import Image from "next/image";
import { Coin } from "./HeroScene3D";

/**
 * The quiet 3D scenery behind sign-in and sign-up: two soft lights and, on wide screens only, a tilted card and a
 * turning coin at the edges. It carries no information, so it is hidden from screen readers and never blocks a click.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-rappio-violet/25 blur-3xl" />
      <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-rappio-blue/20 blur-3xl" />

      <div className="scene hidden xl:block absolute left-[2.5%] bottom-[12%] w-[230px]">
        <div
          className="float-slow relative aspect-[1.586/1] rounded-2xl bg-brand-gradient p-4 text-white shadow-[0_40px_60px_-26px_rgba(1,30,90,0.6)]"
          style={{ transform: "rotateX(10deg) rotateY(22deg) rotateZ(-4deg)", transformStyle: "preserve-3d" }}
        >
          <Image
            src="/brand/rappio-mark.png"
            alt=""
            width={355}
            height={371}
            className="absolute -right-4 -bottom-6 w-[55%] opacity-[0.18] mix-blend-soft-light"
          />
          <p className="font-display text-sm font-bold">Your shop</p>
          <div className="mt-4 grid grid-cols-4 gap-1.5 w-fit">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className={`h-6 w-6 rounded-full ${i < 5 ? "bg-marigold" : "border-2 border-white/40"}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="scene hidden xl:block absolute right-[4%] top-[22%]">
        <div className="float-slower" style={{ transformStyle: "preserve-3d" }}>
          <Coin />
        </div>
      </div>
    </div>
  );
}
