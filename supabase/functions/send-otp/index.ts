// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: send-otp
// Sends a 6-digit OTP code via Twilio SMS for customer portal authentication.
//
// Environment variables needed in Supabase Dashboard > Edge Functions > Secrets:
//   TWILIO_ACCOUNT_SID   - Your Twilio Account SID
//   TWILIO_AUTH_TOKEN     - Your Twilio Auth Token
//   TWILIO_PHONE_NUMBER   - Your Twilio sender phone number (e.g., +15551234567)
//   SUPABASE_URL          - Auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY - Auto-provided by Supabase

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, slug } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, message: 'Phone number is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Normalize phone number
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting: max 3 codes per phone per hour
    const { count } = await supabase
      .from('phone_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString());

    if ((count || 0) >= 3) {
      return new Response(
        JSON.stringify({ success: false, message: 'Too many code requests. Please wait before trying again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Insert OTP record
    const { error: insertErr } = await supabase
      .from('phone_otps')
      .insert({ phone, code, expires_at: new Date(Date.now() + 600000).toISOString() });

    if (insertErr) {
      console.error('Failed to insert OTP:', insertErr);
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to generate code. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Send SMS via Twilio
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioToken || !twilioPhone) {
      // Twilio not configured — log code for dev/testing
      console.log(`[DEV MODE] OTP code for ${phone}: ${code}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Code sent (dev mode — check logs)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const twilioBody = new URLSearchParams({
      To: formattedPhone,
      From: twilioPhone,
      Body: `Your K9 Resorts verification code is: ${code}. It expires in 10 minutes.`,
    });

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
      },
      body: twilioBody,
    });

    if (!twilioRes.ok) {
      const errText = await twilioRes.text();
      console.error('Twilio error:', errText);
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to send SMS. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Verification code sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-otp error:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
