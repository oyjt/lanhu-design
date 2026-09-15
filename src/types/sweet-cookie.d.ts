declare module "@steipete/sweet-cookie" {
  export type Cookie = { name: string; value: string; domain?: string; path?: string };
  export function getCookies(options: {
    url: string;
    browsers?: string[];
    profile?: string;
    chromeProfile?: string;
    edgeProfile?: string;
  }): Promise<{ cookies: Cookie[]; warnings: string[] }>;
  export function toCookieHeader(cookies: Cookie[], options?: { dedupeByName?: boolean }): string;
}
