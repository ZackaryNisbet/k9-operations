// K9 Operations — Subscription status hook
// Checks the user's active subscription from the subscriptions table.

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

export default function useSubscription(userId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["active", "trialing", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) setSubscription(data);
      setLoading(false);
    };
    load();

    // Listen for realtime changes
    const channel = supabase
      .channel("subscription-changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "subscriptions",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new) setSubscription(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isPastDue = subscription?.status === "past_due";

  return { subscription, loading, isActive, isPastDue };
}
