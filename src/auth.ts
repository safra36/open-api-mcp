import type { Session } from "./session.js";

export interface AuthArgs {
  type: "bearer" | "header" | "basic" | "cookie";
  token?: string;
  headerName?: string;
  value?: string;
  username?: string;
  password?: string;
  cookieName?: string;
}

export function applyAuth(session: Session, a: AuthArgs): string {
  switch (a.type) {
    case "bearer": {
      if (!a.token) throw new Error("bearer auth requires `token`");
      session.auth.headers["Authorization"] = `Bearer ${a.token}`;
      return "set bearer token on Authorization header";
    }
    case "header": {
      if (!a.headerName || a.value === undefined) throw new Error("header auth requires `headerName` and `value`");
      session.auth.headers[a.headerName] = a.value;
      return `set header ${a.headerName}`;
    }
    case "basic": {
      if (!a.username || a.password === undefined) throw new Error("basic auth requires `username` and `password`");
      const enc = Buffer.from(`${a.username}:${a.password}`).toString("base64");
      session.auth.headers["Authorization"] = `Basic ${enc}`;
      return "set basic auth on Authorization header";
    }
    case "cookie": {
      const name = a.cookieName ?? "session";
      const value = a.value ?? a.token;
      if (value === undefined) throw new Error("cookie auth requires `value` (or `token`)");
      session.auth.cookies[name] = value;
      return `set cookie ${name}`;
    }
  }
}
