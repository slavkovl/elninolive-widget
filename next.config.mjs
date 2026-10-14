/** @type {import('next').NextConfig} */

/**
 * /widget/embed must be frameable by ANY page — that is the widget's whole
 * purpose — so it gets `frame-ancestors *` and no X-Frame-Options. Every other
 * route refuses framing. The widget loads no third-party script, font or image
 * at runtime (fonts are self-hosted at build time), so the policy can be tight.
 */
// `next dev` serves eval-based source maps; without 'unsafe-eval' the page never
// hydrates in development (the needle stays at zero, the tabs do nothing).
// Production builds keep the strict policy.
const dev = process.env.NODE_ENV === 'development';

const WIDGET_CSP = [
  "default-src 'self'",
  // Next.js App Router emits inline hydration scripts; React inline style={{}} on the gauge.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const csp = (frameAncestors) => [...WIDGET_CSP, `frame-ancestors ${frameAncestors}`].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/widget/embed',
        headers: [{ key: 'Content-Security-Policy', value: csp('*') }],
      },
      {
        // Every path EXCEPT /widget/embed: browsers merge multiple CSP headers by
        // taking the most restrictive, so the embed route must never match this one.
        source: '/:path((?!widget/embed$).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp("'self'") },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
