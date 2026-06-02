// ============================================================================
// Stripo Token Edge Function — K9 Operations
// Mints a short-lived Stripo v2 editor token for the embedded email composer. The
// plugin's secret key never reaches the browser: the client's onTokenRefreshRequest
// callback hits this function, we verify the caller is a signed-in K9 user, read the
// Stripo credentials (env first, then Supabase Vault), call Stripo's auth endpoint,
// and return only the token.
//
// Credentials are read from either edge env (STRIPO_PLUGIN_ID / STRIPO_SECRET_KEY) or
// Supabase Vault (secrets named stripo_plugin_id / stripo_secret_key) via the
// service-role-only get_stripo_credentials() RPC.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STRIPO_AUTH_URL = "https://plugins.stripo.email/api/v1/auth";

async function readCredentials(admin: ReturnType<typeof createClient>): Promise<{ pluginId: string; secretKey: string }> {
  const envPluginId = Deno.env.get("STRIPO_PLUGIN_ID") || "";
  const envSecret = Deno.env.get("STRIPO_SECRET_KEY") || "";
  if (envPluginId && envSecret) return { pluginId: envPluginId, secretKey: envSecret };

  // Fall back to Vault (where the secrets were stored for this project).
  const { data, error } = await admin.rpc("get_stripo_credentials");
  if (error) throw new Error(`Could not read Stripo credentials: ${error.message}`);
  return {
    pluginId: (data as { plugin_id?: string })?.plugin_id || envPluginId,
    secretKey: (data as { secret_key?: string })?.secret_key || envSecret,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    // Verify the caller is a signed-in user before spending a token.
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { pluginId, secretKey } = await readCredentials(admin);
    if (!pluginId || !secretKey) {
      return json({ error: "Stripo plugin is not configured (missing plugin id / secret key)" }, 500);
    }

    let body: { role?: string } = {};
    try { body = await req.json(); } catch (_) { /* empty body is fine */ }
    const role = typeof body?.role === "string" && body.role.trim() ? body.role.trim() : "user";

    const resp = await fetch(STRIPO_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pluginId, secretKey, userId: user.id, role }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: `Stripo auth failed (${resp.status})`, detail: text.slice(0, 300) }, 502);
    }

    const data = await resp.json().catch(() => ({}));
    const token = (data as { token?: string; authToken?: string })?.token
      || (data as { authToken?: string })?.authToken || "";
    if (!token) return json({ error: "Stripo returned no token" }, 502);

    return json({ token });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
