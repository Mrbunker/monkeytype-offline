/** Resolve bundled static assets under the configured deployment directory. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^(?:\.\.\/|\.\/|\/)+/, "")}`;
}
