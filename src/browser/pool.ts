import { chromium, type Browser, type BrowserContext } from "playwright";
import { INSECURE_TLS } from "../tls.js";

const HEADED = /^(1|true|yes|on)$/i.test(process.env.MCP_BROWSER_HEADED ?? "");
const MAX_CONTEXTS = Number(process.env.MCP_BROWSER_MAX ?? 4);

let browser: Browser | undefined;
let contextCount = 0;

/** Acquire an isolated context from the shared Chromium process (launched on first use). */
export async function acquireContext(): Promise<BrowserContext> {
  if (contextCount >= MAX_CONTEXTS)
    throw new Error(`browser context limit reached (MCP_BROWSER_MAX=${MAX_CONTEXTS}); close a context first`);
  if (!browser) browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: INSECURE_TLS });
  contextCount++;
  ctx.once("close", () => {
    contextCount = Math.max(0, contextCount - 1);
  });
  return ctx;
}

/** Close the shared browser and reset the pool (used on process shutdown). */
export async function shutdownPool(): Promise<void> {
  try {
    await browser?.close();
  } catch {
    /* already gone */
  }
  browser = undefined;
  contextCount = 0;
}
