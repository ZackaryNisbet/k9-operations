// ============================================================================
// Stripe Webhook Edge Function — K9 Operations
// Handles Stripe webhook events for subscription lifecycle management.
// Verifies webhook signatures and upserts subscription data into Supabase.
// ============================================================================

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Initialize Clients ─────────────────────────────────────────────────────

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// ─── Event Handlers ─────────────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.user_id;
  const planType = session.metadata?.plan_type;

  if (!userId || !planType) {
    console.warn(
      "[stripe-webhook] checkout.session.completed missing metadata (user_id or plan_type)",
    );
    return;
  }

  // Retrieve the full subscription to get period dates
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.warn(
      "[stripe-webhook] checkout.session.completed has no subscription ID",
    );
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan_type: planType,
      status: "active",
      current_period_start: new Date(
        subscription.current_period_start * 1000,
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(
      "[stripe-webhook] Failed to upsert subscription on checkout:",
      error,
    );
    throw error;
  }

  console.log(
    `[stripe-webhook] Subscription activated for user ${userId}, plan: ${planType}`,
  );
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: subscription.status,
      current_period_start: new Date(
        subscription.current_period_start * 1000,
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error(
      "[stripe-webhook] Failed to update subscription:",
      error,
    );
    throw error;
  }

  console.log(
    `[stripe-webhook] Subscription ${subscriptionId} updated, status: ${subscription.status}`,
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error(
      "[stripe-webhook] Failed to mark subscription as cancelled:",
      error,
    );
    throw error;
  }

  console.log(
    `[stripe-webhook] Subscription ${subscriptionId} cancelled`,
  );
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (!subscriptionId) {
    console.warn(
      "[stripe-webhook] invoice.payment_failed has no subscription ID",
    );
    return;
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    console.error(
      "[stripe-webhook] Failed to mark subscription as past_due:",
      error,
    );
    throw error;
  }

  console.log(
    `[stripe-webhook] Subscription ${subscriptionId} marked as past_due (payment failed)`,
  );
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Get raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return jsonResponse({ error: "Missing stripe-signature header" }, 400);
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error("[stripe-webhook] Signature verification failed:", err);
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

    // Route to the appropriate handler
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
        );
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    // Always return 200 — Stripe best practice to avoid retries
    return jsonResponse({ received: true, type: event.type });
  } catch (err) {
    console.error("[stripe-webhook] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
