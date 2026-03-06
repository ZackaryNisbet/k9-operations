// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: nlp-query
// LLM fallback for the Revenue Intelligence NLP bar.
// Only called when the local intent classifier has low confidence.
// Receives: user query + summary stats (no PII / raw data)
// Returns: { intent: string } mapping to a local aggregator, or { result: object } for direct display.
//
// Environment variables needed:
//   ANTHROPIC_API_KEY — for Claude Haiku (cheapest option)
//   or OPENAI_API_KEY — for GPT-4o-mini

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the AI query engine for K9 Operations, a pet boarding facility POS system.
The user is asking a business intelligence question about their data.

You have access to these pre-built intents (each maps to a local data aggregator):
- rev_by_suite: Revenue broken down by suite/room type
- rev_by_category: Revenue by payment category (Boarding, Daycare, Add-ons, etc.)
- rev_trend: Revenue trend over time with growth metrics
- rev_total: Total revenue summary
- rev_by_service: Revenue by service type (boarding vs daycare vs add-ons)
- top_clients: Top clients ranked by spend
- new_clients: New (first-time) clients in the period
- client_frequency: Client retention and visit frequency
- payment_methods: Payment method breakdown (card, cash, check)
- booking_sources: Booking source breakdown (online, phone, walk-in)
- occupancy: Overall occupancy analysis
- occupancy_by_room: Occupancy broken down by room type
- avg_stay: Average length of stay analysis
- busiest_day: Activity by day of week
- discount_impact: Discount impact analysis
- addon_analysis: Add-on attach rate and revenue
- revpar: Revenue per available room analysis
- top_dogs: Top dogs by stay duration
- breed_breakdown: Reservations by breed

Given the user's query and context, respond with JSON:
{ "intent": "one_of_the_above", "title": "Optional custom title" }

If the query truly cannot be mapped to any intent, respond with:
{ "result": { "type": "message", "title": "...", "message": "..." } }

ALWAYS respond with valid JSON only. No markdown, no explanation.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, context } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try Anthropic first, fall back to OpenAI
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    let llmResponse: string;

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Query: "${query}"\n\nContext: ${JSON.stringify(context)}`,
            },
          ],
        }),
      });
      const data = await res.json();
      llmResponse = data.content?.[0]?.text || '{}';
    } else if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 256,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Query: "${query}"\n\nContext: ${JSON.stringify(context)}`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      llmResponse = data.choices?.[0]?.message?.content || '{}';
    } else {
      return new Response(
        JSON.stringify({
          result: {
            type: 'message',
            title: "I'm not sure what you're looking for",
            message: 'No AI provider configured. Try a more specific query.',
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and return
    const parsed = JSON.parse(llmResponse);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        result: {
          type: 'message',
          title: 'Query Processing Error',
          message: 'Something went wrong. Try a more specific query.',
        },
      }),
      {
        status: 200, // Return 200 so client handles gracefully
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
