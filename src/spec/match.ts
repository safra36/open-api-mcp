export interface PathMatch {
  template: string;
  operationId?: string;
}

function segMatch(template: string, actual: string): boolean {
  const t = template.split("/").filter(Boolean);
  const a = actual.split("?")[0].split("/").filter(Boolean);
  if (t.length !== a.length) return false;
  return t.every((seg, i) =>
    seg.startsWith("{") && seg.endsWith("}") ? true : seg === a[i],
  );
}

/** Find the OpenAPI path template that matches an actual request path. */
export function findMatchingPath(
  spec: { deref: any } | undefined,
  actualPath: string,
  method: string,
): PathMatch | undefined {
  const paths = spec?.deref?.paths;
  if (!paths) return undefined;
  // Prefer exact (no-template) matches before templated ones.
  const keys = Object.keys(paths).sort((a, b) => {
    const ta = (a.match(/\{/g) ?? []).length;
    const tb = (b.match(/\{/g) ?? []).length;
    return ta - tb;
  });
  for (const template of keys) {
    if (segMatch(template, actualPath)) {
      const op = paths[template]?.[method.toLowerCase()];
      return { template, operationId: op?.operationId };
    }
  }
  return undefined;
}
