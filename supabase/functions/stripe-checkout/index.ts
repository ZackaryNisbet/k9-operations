// Supabase Edge Function: stripe-checkout
// Creates Stripe Checkout sessions for subscription plans.
//
// Environment variables needed in Supabase Dashboard > Edge Functions > Secrets:
//   STRIPE_SECRET_KEY       - Your Stripe secret key
//   STRIPE_PRICE_SINGLE     - Stripe Price ID for single_location plan
//   STRIPE_PRICE_MULTI_3    - Stripe Price ID for multi_location_3 plan
//   STRIPE_PRICE_MULTI_10   - Stripe Price ID for multi_location_10 plan
//   SUPABASE_URL            - Auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY - Auto-provided by Supabase

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Map plan_type to the corresponding env var name for the Stripe Price ID. */
const PLAN_PRICE_ENV_MAP: Record<string, string> = {
  single_location: "STRIPE_PRICE_SINGLE",
  multi_location_3: "STRIPE_PRICE_MULTI_3",
  multi_location_10: "STRIPE_PRICE_MULTI_10",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const { plan_type, user_id, success_url, cancel_url } = await req.json();

    // Validate required fields
    if (!plan_type || !user_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields: plan_type, user_id, success_url, cancel_url",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Enterprise plan requires contacting sales
    if (plan_type === "enterprise") {
      return new Response(
        JSON.stringify({
          error:
            "Enterprise plans require a custom agreement. Please contact sales.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate plan type
    const priceEnvVar = PLAN_PRICE_ENV_MAP[plan_type];
    if (!priceEnvVar) {
      return new Response(
        JSON.stringify({
          error: `Invalid plan_type: ${plan_type}. Valid options: single_location, multi_location_3, multi_location_10, enterprise`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve the Stripe Price ID from environment
    const priceId = Deno.env.get(priceEnvVar);
    if (!priceId) {
      console.error(`Missing environment variable: ${priceEnvVar}`);
      return new Response(
        JSON.stringify({ error: "Server configuration error: missing price ID" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("Missing environment variable: STRIPE_SECRET_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error: missing Stripe key" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Initialize Supabase to look up user email
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user email from Supabase auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(user_id);

    if (userError || !user) {
      console.error("Failed to fetch user:", userError?.message);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const email = user.email;
    if (!email) {
      return new Response(
        JSON.stringify({ error: "User does not have an email address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Look up existing Stripe customer by email, or create a new one
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    let customerId: string;

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: {
          supabase_user_id: user_id,
        },
      });
      customerId = newCustomer.id;
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: {
        user_id,
        plan_type,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("stripe-checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
