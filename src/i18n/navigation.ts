import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware replacements for next/link and next/navigation. Import these
 * everywhere instead of the Next.js originals — they keep the `/mr` prefix on
 * every href without each component having to remember it.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
