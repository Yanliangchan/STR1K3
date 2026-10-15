"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * App-wide Link with prefetching OFF by default. Every page here is dynamic
 * and per-user, so viewport prefetching cost a server render per visible link
 * (dozens per screen) without making navigation meaningfully faster.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
