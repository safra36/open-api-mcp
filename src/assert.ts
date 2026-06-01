import type { AssertResult, Session } from "./session.js";
import { validateLast } from "./spec/validate.js";

export interface AssertArgs {
  name: string;
  status?: number;
  bodyContains?: string;
  jsonPointer?: string;
  equals?: unknown;
  schemaValid?: boolean;
  expression?: string;
}

function resolvePointer(obj: any, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return obj;
  let cur = obj;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function runAssert(session: Session, a: AssertArgs): AssertResult {
  const lr = session.lastResponse;
  const reasons: string[] = [];
  let ok = true;

  if (a.status !== undefined) {
    const pass = lr?.status === a.status;
    if (!pass) reasons.push(`status ${lr?.status} != ${a.status}`);
    ok &&= pass;
  }
  if (a.bodyContains !== undefined) {
    const pass = !!lr?.bodyText?.includes(a.bodyContains);
    if (!pass) reasons.push(`body does not contain "${a.bodyContains}"`);
    ok &&= pass;
  }
  if (a.jsonPointer !== undefined) {
    const got = resolvePointer(lr?.body, a.jsonPointer);
    const pass = JSON.stringify(got) === JSON.stringify(a.equals);
    if (!pass) reasons.push(`${a.jsonPointer} = ${JSON.stringify(got)} != ${JSON.stringify(a.equals)}`);
    ok &&= pass;
  }
  if (a.schemaValid) {
    const v = validateLast(session.spec, lr);
    const pass = v.valid === true;
    if (!pass) reasons.push(`schema: ${v.valid === false ? (v.errors ?? []).join("; ") : v.reason}`);
    ok &&= pass;
  }
  if (a.expression) {
    try {
      const fn = new Function("res", "body", `return (${a.expression});`);
      const pass = !!fn(lr, lr?.body);
      if (!pass) reasons.push(`expression false: ${a.expression}`);
      ok &&= pass;
    } catch (e) {
      ok = false;
      reasons.push(`expression error: ${(e as Error).message}`);
    }
  }

  const result: AssertResult = { name: a.name, ok, detail: reasons.join("; ") || "passed", at: Date.now() };
  session.results.push(result);
  return result;
}
