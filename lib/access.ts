/** Cookie set after a successful access-code login. */
export const ACCESS_COOKIE = "consequences_access";

/** Default party code — override with ACCESS_CODE in the environment. */
export const DEFAULT_ACCESS_CODE = "5075";

export function getExpectedAccessCode(): string {
  return (process.env.ACCESS_CODE ?? DEFAULT_ACCESS_CODE).trim();
}

export function isValidAccessCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.trim() === getExpectedAccessCode();
}
