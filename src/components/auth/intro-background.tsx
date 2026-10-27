'use client';

import { Leaf } from 'lucide-react';

/**
 * The shared backdrop for the pre-login flow — a soft green gradient with a
 * scatter of leaf confetti and a couple of blurred bokeh circles, matching
 * the client's reference exactly (session 2026-10-27). One component
 * instead of copying the same decorative markup across Onboarding,
 * SelectLanguage and the login phone step.
 *
 * `fixed inset-0 -z-10 pointer-events-none`: sits behind every screen's own
 * content regardless of scroll, and never intercepts a tap meant for the
 * real UI on top of it.
 */
const LEAVES = [
  { top: '7%', left: '9%', size: 20, rotate: -20, opacity: 0.3 },
  { top: '13%', left: '83%', size: 24, rotate: 25, opacity: 0.28 },
  { top: '27%', left: '4%', size: 14, rotate: 50, opacity: 0.22 },
  { top: '36%', left: '91%', size: 16, rotate: -35, opacity: 0.26 },
  { top: '54%', left: '5%', size: 20, rotate: 15, opacity: 0.22 },
  { top: '60%', left: '89%', size: 14, rotate: -50, opacity: 0.26 },
  { top: '78%', left: '10%', size: 18, rotate: 35, opacity: 0.22 },
  { top: '83%', left: '86%', size: 16, rotate: -15, opacity: 0.26 },
] as const;

export function IntroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-[#eefaf1] via-[#def3e5] to-[#c9e9d6]"
    >
      <div className="absolute top-[6%] -left-[10%] size-56 rounded-full bg-white/40 blur-3xl" />
      <div className="absolute top-[45%] -right-[12%] size-64 rounded-full bg-white/30 blur-3xl" />
      <div className="absolute -bottom-[4%] -left-[8%] size-48 rounded-full bg-white/30 blur-3xl" />

      {LEAVES.map((leaf, index) => (
        <Leaf
          key={index}
          className="absolute text-primary"
          style={{
            top: leaf.top,
            left: leaf.left,
            width: leaf.size,
            height: leaf.size,
            opacity: leaf.opacity,
            transform: `rotate(${leaf.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
