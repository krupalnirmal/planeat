import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * R1 — provider abstraction is mandatory, and this is what makes it a build
 * failure rather than a code-review note.
 *
 * Every vendor SDK is blocked outside `src/lib/services/**`. If a future
 * provider needs a package, add it here and to the allow-list override below;
 * do not import it from a route, a component or a lib module.
 */
const VENDOR_PACKAGES = [
  // AI
  "@google/generative-ai",
  "@google/genai",
  "@anthropic-ai/sdk",
  "groq-sdk",
  "openai",
  // Payments
  "razorpay",
  "cashfree-pg",
  "stripe",
  // Storage
  "cloudinary",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  // Messaging & push
  "firebase-admin",
  "twilio",
  "msg91",
  "whatsapp-web.js",
  // Queue
  "@upstash/qstash",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: VENDOR_PACKAGES.map((name) => ({
            name,
            message:
              "R1: vendor SDKs may only be imported inside src/lib/services/**. Use the port interface (getAIProvider, getPaymentProvider, …) instead.",
          })),
          patterns: [
            {
              group: ["@aws-sdk/*", "firebase-admin/*", "@google-cloud/*"],
              message:
                "R1: vendor SDKs may only be imported inside src/lib/services/**. Use the port interface instead.",
            },
            {
              // R7 — locale-aware navigation only, so no screen can lose its
              // /mr prefix by importing the raw Next.js helpers.
              group: ["next/link"],
              message:
                "Import { Link } from '@/i18n/navigation' so the locale prefix is preserved.",
            },
          ],
        },
      ],
    },
  },

  {
    // Inside the ports themselves, importing the vendor SDK is the entire point.
    files: ["src/lib/services/**"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // R4 — money is BigInt. Seed and scripts run outside the Next.js runtime.
    files: ["prisma/**", "*.config.ts", "*.config.mjs"],
    rules: { "no-restricted-imports": "off", "@typescript-eslint/no-explicit-any": "off" },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client — not ours to lint.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
