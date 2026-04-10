import { Request, Response } from "express";

type TotemAuth = {
  user_id?: number;
  role?: string;
  source?: string;
  session_id?: string | null;
  session_source?: string | null;
  session_expires_at?: string | null;
  last_seen_at?: string | null;
  idle_timeout_at?: string | null;
} | null;

type TotemIdentity = {
  user_id?: number;
  role?: string;
  salons?: Array<number>;
  masters?: Array<number>;
  ownership?: Array<Record<string, unknown>>;
} | null;

type AuthenticatedRequest = Request & {
  auth?: TotemAuth;
  identity?: TotemIdentity;
};

function uniqueNumberList(values: unknown[] = []): number[] {
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )] as number[];
}

function isSessionExpired(auth: TotemAuth): boolean {
  if (!auth?.session_expires_at) return false;

  const now = Date.now();
  const exp = new Date(auth.session_expires_at).getTime();

  return exp < now;
}

function isIdleExpired(auth: TotemAuth): boolean {
  if (!auth?.idle_timeout_at) return false;

  const now = Date.now();
  const idle = new Date(auth.idle_timeout_at).getTime();

  return idle < now;
}

export const authResolveHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = req.auth ?? null;
    const identity = req.identity ?? null;

    const hasAuth = Boolean(auth?.user_id && auth?.role);

    // === CRITICAL: session validity guard ===
    const sessionExpired = isSessionExpired(auth);
    const idleExpired = isIdleExpired(auth);

    const authenticated = hasAuth && !sessionExpired && !idleExpired;

    if (!authenticated) {
      return res.status(200).json({
        ok: true,
        authenticated: false,
        role: "public",
        reason: sessionExpired
          ? "SESSION_EXPIRED"
          : idleExpired
          ? "IDLE_TIMEOUT"
          : "NO_AUTH",
        auth: null,
        identity: {
          user_id: null,
          role: "public",
          salons: [],
          masters: [],
          ownership: []
        }
      });
    }

    const salons = uniqueNumberList(Array.isArray(identity?.salons) ? identity!.salons! : []);
    const masters = uniqueNumberList(Array.isArray(identity?.masters) ? identity!.masters! : []);
    const ownership = Array.isArray(identity?.ownership) ? identity!.ownership! : [];

    return res.status(200).json({
      ok: true,
      authenticated: true,
      role: String(auth?.role || "public"),
      auth: {
        user_id: Number(auth?.user_id),
        role: String(auth?.role || "public"),
        source: auth?.source || null,
        session_id: auth?.session_id || null,
        session_source: auth?.session_source || null,
        session_expires_at: auth?.session_expires_at || null,
        last_seen_at: auth?.last_seen_at || null,
        idle_timeout_at: auth?.idle_timeout_at || null
      },
      identity: {
        user_id: Number(identity?.user_id || auth?.user_id),
        role: String(identity?.role || auth?.role || "public"),
        salons,
        masters,
        ownership
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "auth_resolve_failed"
    });
  }
};