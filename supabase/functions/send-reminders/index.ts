// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: send-reminders
// Daily cron function that scans all locations for expiring vaccines and sends SMS reminders.
//
// Can be triggered two ways:
//   1. Supabase Cron (recommended): Set up in Dashboard > Database > Extensions > pg_cron
//      SELECT cron.schedule('vaccine-reminders', '0 9 * * *', $$SELECT net.http_post(...)$$);
//   2. Manual HTTP POST: { "locationId": "xxx" } to send for a specific location
//
// Environment variables needed:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VACCINE_NAMES: Record<string, string> = {
  rabies_exp: 'Rabies',
  dhpp_exp: 'Distemper (DHPP)',
  bordetella_exp: 'Bordetella',
  canine_flu_exp: 'Canine Influenza',
};

interface Tier {
  id: string;
  name: string;
  dayStart: number;
  dayEnd: number;
  priority: string;
  enabled: boolean;
  template: string;
}

interface ReminderItem {
  dogId: string;
  dogName: string;
  vaccineId: string;
  vaccineName: string;
  expiryDate: string;
  daysUntil: number;
  tierId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Optional: target a specific location
    let targetLocationId: string | null = null;
    try {
      const body = await req.json();
      targetLocationId = body.locationId || null;
    } catch { /* no body = scan all */ }

    // Fetch locations
    let query = supabase.from('locations').select('id, data');
    if (targetLocationId) {
      query = query.eq('id', targetLocationId);
    }
    const { data: locations, error: locErr } = await query;
    if (locErr) throw new Error(`Failed to fetch locations: ${locErr.message}`);

    const results: any[] = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    for (const loc of (locations || [])) {
      const d = loc.data || {};
      const autoCfg = d.automations || {};
      if (!autoCfg.enabled) continue;

      const tiers: Tier[] = (autoCfg.tiers || []).filter((t: Tier) => t.enabled);
      if (!tiers.length) continue;

      const log = autoCfg.reminderLog || [];
      const dogs = d.dogs || [];
      const clients = d.clients || [];
      const allVaccineIds = d.requiredVaccines || ['rabies_exp', 'dhpp_exp', 'bordetella_exp'];
      const dailyCap = autoCfg.dailyCap || 50;
      const sentTodayCount = log.filter((l: any) => l.sentAt && l.sentAt.slice(0, 10) === todayStr).length;
      let remaining = dailyCap - sentTodayCount;

      // Build dedup set
      const sentKeys = new Set(log.map((l: any) => `${l.clientId}|${(l.dogIds || []).join(',')}|${(l.vaccineIds || []).join(',')}|${l.tierId}`));

      // Client batching
      const clientBatches: Record<string, { client: any; phone: string; items: ReminderItem[] }> = {};
      const priOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

      for (const dog of dogs) {
        if (!dog.fields || !dog.clientId) continue;
        const client = clients.find((c: any) => c.id === dog.clientId);
        if (!client) continue;
        if (client.notificationPrefs?.vaccineAlerts === false) continue;
        if (client.notificationPrefs?.textReminders === false) continue;
        const phone = client.phone || client.mobilePhone;
        if (!phone) continue;

        for (const vId of allVaccineIds) {
          const expiryStr = dog.fields[vId];
          if (!expiryStr) continue;
          const expiryDate = new Date(expiryStr + 'T00:00:00');
          const daysUntil = Math.round((expiryDate.getTime() - now.getTime()) / 86400000);

          const sortedTiers = [...tiers].sort((a, b) => (priOrder[a.priority] || 3) - (priOrder[b.priority] || 3));

          for (const tier of sortedTiers) {
            const minDay = Math.min(tier.dayStart, tier.dayEnd);
            const maxDay = Math.max(tier.dayStart, tier.dayEnd);
            if (daysUntil >= minDay && daysUntil <= maxDay) {
              const dedupKey = `${client.id}|${dog.id}|${vId}|${tier.id}`;
              if (sentKeys.has(dedupKey)) break;

              if (!clientBatches[client.id]) {
                clientBatches[client.id] = { client, phone, items: [] };
              }
              clientBatches[client.id].items.push({
                dogId: dog.id,
                dogName: dog.fields.name || dog.name || 'your dog',
                vaccineId: vId,
                vaccineName: VACCINE_NAMES[vId] || vId.replace('_exp', ''),
                expiryDate: expiryStr,
                daysUntil,
                tierId: tier.id,
              });
              break;
            }
          }
        }
      }

      // Sort batches by urgency
      const batchEntries = Object.values(clientBatches).sort((a, b) => {
        const findTier = (tierId: string) => tiers.find(t => t.id === tierId);
        const aPri = Math.min(...a.items.map(i => priOrder[findTier(i.tierId)?.priority || 'low'] || 3));
        const bPri = Math.min(...b.items.map(i => priOrder[findTier(i.tierId)?.priority || 'low'] || 3));
        return aPri - bPri;
      });

      const newLogEntries: any[] = [];

      for (const batch of batchEntries) {
        if (remaining <= 0) break;
        const { client, phone, items } = batch;
        const locationName = d.facilityName || d.name || 'K9 Resorts';

        // Build message
        let message: string;
        const highestItem = items.reduce((a, b) => {
          const aT = tiers.find(t => t.id === a.tierId);
          const bT = tiers.find(t => t.id === b.tierId);
          return (priOrder[aT?.priority || 'low'] || 3) <= (priOrder[bT?.priority || 'low'] || 3) ? a : b;
        });
        const highestTier = tiers.find(t => t.id === highestItem.tierId)!;
        const daysStr = highestItem.daysUntil > 0 ? `in ${highestItem.daysUntil} days` : highestItem.daysUntil === 0 ? 'today' : `${Math.abs(highestItem.daysUntil)} days ago`;

        if (items.length > 1) {
          message = `Hi ${client.firstName || 'there'}! This is a reminder from ${locationName} about upcoming vaccine expirations:\n`;
          items.forEach(item => {
            const ds = item.daysUntil > 0 ? `expires in ${item.daysUntil} days` : item.daysUntil === 0 ? 'expires today' : `expired ${Math.abs(item.daysUntil)} days ago`;
            message += `• ${item.dogName} — ${item.vaccineName} (${ds}, ${item.expiryDate})\n`;
          });
          message += `Please update your records so we can continue providing great care!`;
        } else {
          message = highestTier.template
            .replace(/\{ownerFirst\}/g, client.firstName || 'there')
            .replace(/\{ownerLast\}/g, client.lastName || '')
            .replace(/\{dogName\}/g, highestItem.dogName)
            .replace(/\{vaccineName\}/g, highestItem.vaccineName)
            .replace(/\{expiryDate\}/g, highestItem.expiryDate)
            .replace(/\{locationName\}/g, locationName)
            .replace(/\{daysUntil\}/g, daysStr);
        }

        // Send SMS via Twilio
        let status = 'pending';
        let twilioSidMsg: string | null = null;

        if (twilioSid && twilioToken && twilioPhone) {
          const cleanPhone = phone.replace(/\D/g, '');
          const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;

          try {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
            const twilioRes = await fetch(twilioUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
              },
              body: new URLSearchParams({ To: formattedPhone, From: twilioPhone, Body: message }),
            });

            if (twilioRes.ok) {
              const twilioData = await twilioRes.json();
              status = 'sent';
              twilioSidMsg = twilioData.sid || null;
            } else {
              const errText = await twilioRes.text();
              console.error(`Twilio error for ${client.id}:`, errText);
              status = 'failed';
            }
          } catch (smsErr) {
            console.error(`SMS send error for ${client.id}:`, smsErr);
            status = 'failed';
          }
        } else {
          // Dev mode — log instead of sending
          console.log(`[DEV] Reminder for ${client.firstName} ${client.lastName} (${phone}): ${message}`);
          status = 'sent';
        }

        const logEntry = {
          id: 'rem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          clientId: client.id,
          dogIds: [...new Set(items.map(i => i.dogId))],
          dogNames: [...new Set(items.map(i => i.dogName))],
          vaccineIds: [...new Set(items.map(i => i.vaccineId))],
          vaccineNames: [...new Set(items.map(i => i.vaccineName))],
          type: 'vaccine_expiry',
          channel: 'sms',
          phone,
          message,
          tierId: highestItem.tierId,
          tierName: highestTier.name,
          tierPriority: highestTier.priority,
          intervalKey: highestTier.name,
          status,
          twilioSid: twilioSidMsg,
          sentAt: new Date().toISOString(),
          scheduledFor: todayStr,
          items: items.map(i => ({ dogId: i.dogId, dogName: i.dogName, vaccineId: i.vaccineId, vaccineName: i.vaccineName, expiryDate: i.expiryDate, daysUntil: i.daysUntil, tierId: i.tierId })),
        };

        newLogEntries.push(logEntry);
        remaining--;
      }

      // Persist new log entries to location data
      if (newLogEntries.length > 0) {
        const updatedLog = [...log, ...newLogEntries];
        // Keep last 500 entries to prevent unbounded growth
        const trimmedLog = updatedLog.slice(-500);
        const updatedData = { ...d, automations: { ...autoCfg, reminderLog: trimmedLog } };

        const { error: updateErr } = await supabase
          .from('locations')
          .update({ data: updatedData })
          .eq('id', loc.id);

        if (updateErr) {
          console.error(`Failed to update location ${loc.id}:`, updateErr.message);
        }
      }

      results.push({
        locationId: loc.id,
        scanned: dogs.length,
        remindersSent: newLogEntries.filter(e => e.status === 'sent').length,
        remindersFailed: newLogEntries.filter(e => e.status === 'failed').length,
        dailyCapRemaining: remaining,
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-reminders error:', err);
    return new Response(
      JSON.stringify({ success: false, message: (err as Error).message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
