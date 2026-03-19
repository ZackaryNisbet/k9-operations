// ============================================================================
// Stripe Webhook Edge Function — K9 Operations
// Handles Stripe subscription lifecycle events.
// Includes role auto-assignment based on subscription tier.
//
// TODO: Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to Supabase secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// TODO: Add STRIPE_SECRET_KEY to Supabase Edge Function secrets
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
// TODO: Add STRIPE_WEBHOOK_SECRET to Supabase Edge Function secrets
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

// ─── Plan → Role & Location Limit Mapping ──────────────────────────────────
// This mapping determines the role and location limit assigned when a user
// subscribes to a plan. The plan_type comes from Stripe checkout metadata.
const PLAN_CONFIG: Record<string, { role: string; locationLimit: number }> = {
  single_location:   { role: "location_admin",       locationLimit: 1 },
  multi_location_3:  { role: "multi_location_admin",  locationLimit: 3 },
  multi_location_10: { role: "multi_location_admin",  locationLimit: 10 },
  enterprise:        { role: "enterprise_admin",      locationLimit: -1 }, // -1 = unlimited
};

// ─── Stripe signature verification ──────────────────────────────────────────
async function verifySignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = sigHeader.split(",").reduce(
    (acc: Record<string, string>, part) => {
      const [key, val] = part.split("=");
      acc[key] = val;
      return acc;
    },
    {},
  );

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Verify timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSig === signature;
}

// ─── Helper: Update user role in profiles table ─────────────────────────────
async function updateUserRole(
  supabase: any,
  userId: string,
  role: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    console.error(`Failed to update role for user ${userId}:`, error.message);
  } else {
    console.log(`Role updated for user ${userId}: ${role}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const sigHeader = req.headers.get("stripe-signature") || "";

    // Verify webhook signature
    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifySignature(body, sigHeader, STRIPE_WEBHOOK_SECRET);
      if (!valid) {
        console.error("Invalid Stripe webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const event = JSON.parse(body);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const planType = session.metadata?.plan_type || "single_location";
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        if (!userId) {
          console.error("No user_id in checkout session metadata");
          break;
        }

        // Fetch subscription details from Stripe
        let periodStart: string | null = null;
        let periodEnd: string | null = null;

        if (stripeSubscriptionId && STRIPE_SECRET_KEY) {
          try {
            const subResp = await fetch(
              `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
              {
                headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
              },
            );
            if (subResp.ok) {
              const subData = await subResp.json();
              periodStart = new Date(subData.current_period_start * 1000).toISOString();
              periodEnd = new Date(subData.current_period_end * 1000).toISOString();
            }
          } catch (e) {
            console.error("Failed to fetch subscription details:", e);
          }
        }

        // Determine role and location limit from plan type
        const planConfig = PLAN_CONFIG[planType] || PLAN_CONFIG.single_location;

        // Upsert subscription record
        const { error } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            plan_type: planType,
            status: "active",
            location_limit: planConfig.locationLimit,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          },
          { onConflict: "user_id" },
        );

        if (error) console.error("Upsert subscription error:", error.message);

        // Auto-assign role based on subscription tier
        await updateUserRole(supabase, userId, planConfig.role);

        console.log(`Subscription created for user ${userId}: ${planType} → role: ${planConfig.role}, locations: ${planConfig.locationLimit}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;
        if (!userId) break;

        const status = subscription.cancel_at_period_end
          ? "cancelled"
          : subscription.status === "past_due"
            ? "past_due"
            : subscription.status === "trialing"
              ? "trialing"
              : "active";

        // Check if plan changed (upgrade/downgrade)
        const planType = subscription.metadata?.plan_type;
        const updateData: Record<string, any> = {
          status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        };

        // If plan type is in metadata, update it and the location limit
        if (planType && PLAN_CONFIG[planType]) {
          updateData.plan_type = planType;
          updateData.location_limit = PLAN_CONFIG[planType].locationLimit;

          // Update role on plan change (only if subscription is still active)
          if (status === "active" || status === "trialing") {
            await updateUserRole(supabase, userId, PLAN_CONFIG[planType].role);
          }
        }

        await supabase
          .from("subscriptions")
          .update(updateData)
          .eq("stripe_subscription_id", subscription.id);

        console.log(`Subscription updated ${subscription.id}: ${status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;

        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("stripe_subscription_id", subscription.id);

        // Note: We do NOT revoke the user's role here immediately.
        // The SubscriptionGate component handles blocking access for cancelled subs.
        // This allows the user to still log in and see the "Subscription Required" gate.

        console.log(`Subscription cancelled: ${subscription.id} (user: ${userId || "unknown"})`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subscriptionId);

          console.log(`Subscription past_due: ${subscriptionId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("stripe-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
