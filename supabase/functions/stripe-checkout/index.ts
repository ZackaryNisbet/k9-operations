// ============================================================================
// Stripe Checkout Edge Function — K9 Operations
// Creates Stripe Checkout Sessions for subscription plans.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
//   STRIPE_PRICE_SINGLE     — price_... (Starter $149/mo)
//   STRIPE_PRICE_MULTI_3    — price_... (Growth $349/mo)
//   STRIPE_PRICE_MULTI_10   — price_... (Scale $799/mo)
//   STRIPE_PRICE_ENTERPRISE — price_... (Enterprise custom)
//
// Set via: supabase secrets set STRIPE_SECRET_KEY=sk_live_...
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Plan price IDs — set these in Supabase secrets
const PRICE_MAP: Record<string, string> = {
  single_location: Deno.env.get("STRIPE_PRICE_SINGLE") || "",
  multi_location_3: Deno.env.get("STRIPE_PRICE_MULTI_3") || "",
  multi_location_10: Deno.env.get("STRIPE_PRICE_MULTI_10") || "",
  enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

async function stripeRequest(
  endpoint: string,
  body: Record<string, string>,
): Promise<any> {
  const resp = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error?.message || `Stripe API error ${resp.status}`);
  }
  return resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { plan_type, success_url, cancel_url } = await req.json();

    if (!plan_type || !PRICE_MAP[plan_type]) {
      return new Response(
        JSON.stringify({ error: "Invalid plan_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const priceId = PRICE_MAP[plan_type];
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "Price ID not configured for this plan" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get user from auth header
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if user already has a Stripe customer ID
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existingSub } = await supabaseService
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripeRequest("customers", {
        email: user.email || "",
        "metadata[user_id]": user.id,
        "metadata[plan_type]": plan_type,
      });
      customerId = customer.id;
    }

    // Create Checkout Session
    const session = await stripeRequest("checkout/sessions", {
      customer: customerId,
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: success_url || `${req.headers.get("origin")}/lite/onboarding?step=provision&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/lite/pricing`,
      "metadata[user_id]": user.id,
      "metadata[plan_type]": plan_type,
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan_type]": plan_type,
    });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("stripe-checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
