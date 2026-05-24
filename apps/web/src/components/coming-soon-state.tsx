'use client';

import Link from 'next/link';
import { ArrowUpRight, Construction } from 'lucide-react';
import { Badge, type BadgeTone } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';

/**
 * <ComingSoonState />
 *
 * Premium full-page placeholder for unfinished operational modules.
 * Per project_coming_soon_state memory: this is a product-anticipation
 * moment, NOT a roadmap disclaimer. Every locked module routes through
 * the same primitive so the platform's voice on "what does not exist
 * yet" stays consistent.
 *
 * Direction:
 *   - enterprise SaaS polish, not consumer-app cheerful
 *   - navy-only palette (orange retired 2026-05-24)
 *   - subtle motion only; no flashy animations
 *   - copy short, confident, launch-staging tone
 *   - illustration is a CSS/SVG-native scene, NOT external PNG/3D
 *
 * Status vocabulary (replaces generic "Coming soon"):
 *   - 'in-development'     actively being built, near-term ship
 *   - 'under-construction' interim rework in flight
 *   - 'rolling-out'        phased release, gradually available
 *   - 'planned'            committed roadmap item, not yet started
 *   - 'early-access'       preview cohort can use it
 */

export type ComingSoonStatus =
  | 'in-development'
  | 'under-construction'
  | 'rolling-out'
  | 'planned'
  | 'early-access';

export type ComingSoonPlatform =
  | 'amazon'
  | 'walmart'
  | 'shopify'
  | 'meta'
  | 'google'
  | 'tiktok'
  | 'ebay'
  | 'etsy';

export type ComingSoonIllustration = 'construction' | 'blueprint' | 'orbit';

export interface ComingSoonStateProps {
  /** Module headline. e.g. "Unit Economics is under construction" */
  readonly title: string;
  /** One-sentence anticipation line, ~12-18 words. */
  readonly subtitle: string;
  /** Lifecycle stage label; renders as a small pill above the title. */
  readonly status: ComingSoonStatus;
  /** Optional ETA chip rendered next to the status pill. */
  readonly eta?: string;
  /**
   * Optional platforms this module will support, rendered as a row of
   * neutral chips beneath the subtitle. Order is significant.
   */
  readonly platforms?: ReadonlyArray<ComingSoonPlatform>;
  /** SVG illustration variant. */
  readonly illustration?: ComingSoonIllustration;
  /** Optional link to an Academy article previewing what's coming. */
  readonly docsLink?: string;
  /** Short module name used in microcopy ("Stay tuned for {featureName}"). */
  readonly featureName?: string;
  readonly className?: string;
}

export function ComingSoonState({
  title,
  subtitle,
  status,
  eta,
  platforms,
  illustration = 'construction',
  docsLink,
  featureName,
  className,
}: ComingSoonStateProps) {
  const statusMeta = STATUS_META[status];
  return (
    <div
      className={cn(
        'flex min-h-[calc(100vh-3.5rem)] w-full items-center justify-center px-6 py-12',
        className,
      )}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
        <Illustration variant={illustration} />

        <div className="flex items-center gap-2">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          {eta ? (
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
              {eta}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {platforms && platforms.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {platforms.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground/80"
              >
                {PLATFORM_LABEL[p]}
              </span>
            ))}
          </div>
        ) : null}

        {docsLink ? (
          <Link
            href={docsLink}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            Preview in Academy
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}

        <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Construction className="h-3 w-3" />
          <span>
            Stay tuned{featureName ? ` for ${featureName}` : ''}.
          </span>
        </div>
      </div>
    </div>
  );
}

// ----- Status metadata ------------------------------------------------

const STATUS_META: Record<ComingSoonStatus, { label: string; tone: BadgeTone }> = {
  'in-development':     { label: 'In development',     tone: 'info' },
  'under-construction': { label: 'Under construction', tone: 'warning' },
  'rolling-out':        { label: 'Rolling out',        tone: 'success' },
  'planned':            { label: 'Planned',            tone: 'neutral' },
  'early-access':       { label: 'Early access',       tone: 'info' },
};

const PLATFORM_LABEL: Record<ComingSoonPlatform, string> = {
  amazon:  'Amazon',
  walmart: 'Walmart',
  shopify: 'Shopify',
  meta:    'Meta Ads',
  google:  'Google Ads',
  tiktok:  'TikTok',
  ebay:    'eBay',
  etsy:    'Etsy',
};

// ----- Illustrations (CSS/SVG-native, navy-only) ----------------------

function Illustration({ variant }: { variant: ComingSoonIllustration }) {
  if (variant === 'blueprint') return <BlueprintIllustration />;
  if (variant === 'orbit') return <OrbitIllustration />;
  return <ConstructionIllustration />;
}

/**
 * Default construction motif: a stylized scaffold + traffic cone +
 * a shimmering "dashboard under construction" rectangle. All strokes
 * read through the accent token (navy). Background uses muted gradient
 * for the slight cloud-soft feel from the reference mockup.
 */
function ConstructionIllustration() {
  return (
    <div className="relative h-44 w-64">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-accent-50 to-muted/60" />
      <svg
        className="relative h-full w-full"
        viewBox="0 0 256 176"
        fill="none"
        aria-hidden="true"
      >
        {/* Dashboard mockup being built. The plot area shimmers. */}
        <rect
          x="32"
          y="44"
          width="120"
          height="96"
          rx="6"
          className="fill-card stroke-accent/40"
          strokeWidth="1.5"
        />
        <rect x="44" y="58" width="40" height="6" rx="2" className="fill-accent/25" />
        <rect x="44" y="72" width="96" height="2" rx="1" className="fill-border" />
        <foreignObject x="44" y="82" width="96" height="48">
          <div className="h-full w-full overflow-hidden rounded-sm bg-muted">
            <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          </div>
        </foreignObject>

        {/* Scaffold / crane mast on the right. */}
        <line x1="200" y1="20" x2="200" y2="148" className="stroke-accent" strokeWidth="2" />
        <line x1="200" y1="32" x2="232" y2="32" className="stroke-accent" strokeWidth="2" />
        <line x1="220" y1="32" x2="220" y2="58" className="stroke-accent/60" strokeWidth="1.5" />
        <rect x="212" y="58" width="16" height="14" rx="1.5" className="fill-card stroke-accent" strokeWidth="1.5" />
        {/* Cross-bracing on the mast. */}
        <line x1="200" y1="80" x2="208" y2="100" className="stroke-accent/40" strokeWidth="1" />
        <line x1="208" y1="80" x2="200" y2="100" className="stroke-accent/40" strokeWidth="1" />
        <line x1="200" y1="110" x2="208" y2="130" className="stroke-accent/40" strokeWidth="1" />
        <line x1="208" y1="110" x2="200" y2="130" className="stroke-accent/40" strokeWidth="1" />

        {/* Traffic cone (neutral gray, no orange per design system). */}
        <polygon
          points="168,148 176,116 184,148"
          className="fill-muted stroke-accent/60"
          strokeWidth="1.5"
        />
        <rect x="166" y="146" width="20" height="4" rx="1" className="fill-accent/30" />
        <rect x="170" y="128" width="12" height="2" className="fill-card" />

        {/* Ground line. */}
        <line x1="16" y1="152" x2="240" y2="152" className="stroke-accent/30" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    </div>
  );
}

/**
 * Blueprint variant: schematic grid suggesting design-in-progress.
 * Useful for "planned" / "in-development" surfaces where the work is
 * earlier in the lifecycle.
 */
function BlueprintIllustration() {
  return (
    <div className="relative h-44 w-64">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-accent-50 to-muted/60" />
      <svg
        className="relative h-full w-full"
        viewBox="0 0 256 176"
        fill="none"
        aria-hidden="true"
      >
        {/* Grid backdrop. */}
        <defs>
          <pattern id="csgrid" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" className="stroke-accent/15" strokeWidth="0.5" fill="none" />
          </pattern>
        </defs>
        <rect x="24" y="20" width="208" height="136" rx="6" fill="url(#csgrid)" className="stroke-accent/30" strokeWidth="1.5" />

        {/* Schematic boxes representing a half-designed layout. */}
        <rect x="40" y="36" width="64" height="24" rx="2" className="fill-card stroke-accent" strokeWidth="1.5" />
        <rect x="112" y="36" width="104" height="24" rx="2" className="fill-card stroke-accent/60" strokeWidth="1.5" strokeDasharray="3 3" />
        <rect x="40" y="72" width="176" height="56" rx="2" className="fill-card stroke-accent/60" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="40" y1="100" x2="216" y2="100" className="stroke-accent/40" strokeWidth="1" strokeDasharray="2 4" />
      </svg>
    </div>
  );
}

/**
 * Orbit variant: concentric rings with a center node. Useful for
 * AI / engine / intelligence modules where the visual language wants
 * to feel computational rather than physical.
 */
function OrbitIllustration() {
  return (
    <div className="relative h-44 w-64">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-accent-50 to-muted/60" />
      <svg
        className="relative h-full w-full"
        viewBox="0 0 256 176"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="128" cy="88" r="72" className="stroke-accent/20" strokeWidth="1" />
        <circle cx="128" cy="88" r="48" className="stroke-accent/35" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="128" cy="88" r="24" className="stroke-accent/55" strokeWidth="1.5" />
        <circle cx="128" cy="88" r="6" className="fill-accent" />
        {/* Satellite nodes. */}
        <circle cx="200" cy="88" r="3" className="fill-accent/70" />
        <circle cx="80" cy="40" r="3" className="fill-accent/70" />
        <circle cx="92" cy="140" r="3" className="fill-accent/70" />
      </svg>
    </div>
  );
}
