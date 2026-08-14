/**
 * The version the running server reports.
 *
 * One constant rather than a literal at each call site: `/api/health` and `/feedback` both publish
 * it, and two numbers that are supposed to agree but are edited separately eventually do not — at
 * which point the operator diagnosing a mismatched bundle is reading a lie.
 */
export const APP_VERSION = '0.1.0';
