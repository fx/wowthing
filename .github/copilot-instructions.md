# GitHub Copilot Instructions

## PR Review Checklist (CRITICAL)
<!-- KEEP THIS SECTION UNDER 4000 CHARS - Copilot only reads first ~4000 -->

- **Token encryption**: `access_token` and `refresh_token` in the users table are encrypted at the application layer using AES-256-GCM before storage. The `text` column type is intentional -- it stores encrypted ciphertext, not plaintext. Do not suggest changing to `bytea` or flagging as a security issue.
- **drizzle.config.ts env vars**: `process.env.DATABASE_URL!` in drizzle.config.ts is standard usage for a CLI tool. drizzle-kit provides its own clear error when the URL is missing. Do not suggest adding env validation in the config file.
- **updatedAt columns**: `updatedAt` columns use `defaultNow()` for initial value. Updates are handled at the application layer via Drizzle set operations. Do not suggest adding database triggers or `$onUpdate`.
