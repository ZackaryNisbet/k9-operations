import { getSimulatedNow } from "./format";
import { uuid } from "./ids";

const buildVaccineReminders = (data) => {
  const autoCfg = data.automations || {};
  if (!autoCfg.enabled) return [];
  const tiers = (autoCfg.tiers || []).filter(t => t.enabled);
  if (!tiers.length) return [];
  const log = autoCfg.reminderLog || [];
  const dogs = data.dogs || [];
  const clients = data.clients || [];
  const allVaccineIds = (data.requiredVaccines || ["rabies_exp", "dhpp_exp", "bordetella_exp"]);
  const vaccineNames = { rabies_exp: "Rabies", dhpp_exp: "Distemper (DHPP)", bordetella_exp: "Bordetella", canine_flu_exp: "Canine Influenza" };
  const now = getSimulatedNow(); // Time Travel aware
  const todayStr = now.toISOString().slice(0, 10);

  // Build set of already-sent (clientId + dogId + vaccineId + tierId) combos
  const sentKeys = new Set(log.map(l => `${l.clientId}|${(l.dogIds||[]).join(",")}|${(l.vaccineIds||[]).join(",")}|${l.tierId}`));

  // Per-client batching map: clientId → { client, items: [{ dog, vaccineName, vaccineId, tier, daysUntil }] }
  const clientBatches = {};

  for (const dog of dogs) {
    if (!dog.fields || !dog.clientId) continue;
    const client = clients.find(c => c.id === dog.clientId);
    if (!client) continue;
    // Respect opt-out
    if (client.notificationPrefs && client.notificationPrefs.vaccineAlerts === false) continue;
    if (client.notificationPrefs && client.notificationPrefs.textReminders === false) continue;
    // Need phone number (stored in client.fields.phone)
    const phone = client.fields?.phone;
    if (!phone) continue;

    for (const vId of allVaccineIds) {
      const expiryStr = dog.fields[vId];
      if (!expiryStr) continue; // Missing vaccine — not in reminder flow (that's a compliance issue, not a reminder)
      const expiryDate = new Date(expiryStr + "T00:00:00");
      const diffMs = expiryDate - now;
      const daysUntil = Math.round(diffMs / 86400000);

      // Find matching tier (first match by day range)
      // Sort tiers by priority: critical > high > medium > low, so most urgent fires first
      const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedTiers = [...tiers].sort((a, b) => (priOrder[a.priority] || 3) - (priOrder[b.priority] || 3));

      for (const tier of sortedTiers) {
        const minDay = Math.min(tier.dayStart, tier.dayEnd);
        const maxDay = Math.max(tier.dayStart, tier.dayEnd);
        if (daysUntil >= minDay && daysUntil <= maxDay) {
          // Check dedup
          const dedupKey = `${client.id}|${dog.id}|${vId}|${tier.id}`;
          if (sentKeys.has(dedupKey)) break; // Already sent for this tier, skip to next vaccine

          // Add to batch
          if (!clientBatches[client.id]) {
            clientBatches[client.id] = { client, phone, items: [] };
          }
          clientBatches[client.id].items.push({
            dog,
            dogName: dog.fields.name || dog.name || "your dog",
            vaccineName: vaccineNames[vId] || vId.replace("_exp", ""),
            vaccineId: vId,
            tier,
            expiryDate: expiryStr,
            daysUntil,
          });
          break; // Only match the first (most urgent) tier per vaccine
        }
      }
    }
  }

  // Build reminder actions from batches
  const reminders = [];
  const dailyCap = autoCfg.dailyCap || 50;
  // Count how many were already sent today
  const sentTodayCount = log.filter(l => l.sentAt && l.sentAt.slice(0, 10) === todayStr).length;
  let remaining = dailyCap - sentTodayCount;

  // Sort batches by highest priority item (critical first)
  const batchEntries = Object.values(clientBatches).sort((a, b) => {
    const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aPri = Math.min(...a.items.map(i => priOrder[i.tier.priority] || 3));
    const bPri = Math.min(...b.items.map(i => priOrder[i.tier.priority] || 3));
    return aPri - bPri;
  });

  for (const batch of batchEntries) {
    if (remaining <= 0) break;
    const { client, phone, items } = batch;
    // Group items by tier for message construction
    // Use highest-priority tier's template as the base
    const highestItem = items.reduce((a, b) => {
      const priOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priOrder[a.tier.priority] || 3) <= (priOrder[b.tier.priority] || 3) ? a : b;
    });

    // Build message — if multiple vaccines, list them all
    let message = highestItem.tier.template;
    const locationName = data.facilityName || data.name || "K9 Operations";
    const dogNames = [...new Set(items.map(i => i.dogName))];
    const vaccineNamesList = [...new Set(items.map(i => i.vaccineName))];
    const daysStr = highestItem.daysUntil > 0 ? `in ${highestItem.daysUntil} days` : highestItem.daysUntil === 0 ? "today" : `${Math.abs(highestItem.daysUntil)} days ago`;

    // If multiple vaccines/dogs, append a summary
    if (items.length > 1) {
      message = `Hi ${client.firstName || "there"}! This is a reminder from ${locationName} about upcoming vaccine expirations:\n`;
      items.forEach(item => {
        const ds = item.daysUntil > 0 ? `expires in ${item.daysUntil} days` : item.daysUntil === 0 ? "expires today" : `expired ${Math.abs(item.daysUntil)} days ago`;
        message += `• ${item.dogName} — ${item.vaccineName} (${ds}, ${item.expiryDate})\n`;
      });
      message += `Please update your records so we can continue providing great care!`;
    } else {
      // Single vaccine — use template with merge tags
      message = message
        .replace(/\{ownerFirst\}/g, client.firstName || "there")
        .replace(/\{ownerLast\}/g, client.lastName || "")
        .replace(/\{dogName\}/g, highestItem.dogName)
        .replace(/\{vaccineName\}/g, highestItem.vaccineName)
        .replace(/\{expiryDate\}/g, highestItem.expiryDate)
        .replace(/\{locationName\}/g, locationName)
        .replace(/\{daysUntil\}/g, daysStr);
    }

    reminders.push({
      id: uuid(),
      clientId: client.id,
      dogIds: [...new Set(items.map(i => i.dog.id))],
      dogNames,
      vaccineIds: [...new Set(items.map(i => i.vaccineId))],
      vaccineNames: vaccineNamesList,
      type: "vaccine_expiry",
      channel: "sms",
      phone,
      message,
      tierId: highestItem.tier.id,
      tierName: highestItem.tier.name,
      tierPriority: highestItem.tier.priority,
      intervalKey: highestItem.tier.name,
      scheduledFor: todayStr,
      status: "pending",
      sentAt: null,
      items: items.map(i => ({ dogId: i.dog.id, dogName: i.dogName, vaccineId: i.vaccineId, vaccineName: i.vaccineName, expiryDate: i.expiryDate, daysUntil: i.daysUntil, tierId: i.tier.id })),
    });
    remaining--;
  }

  return reminders;
};

export { buildVaccineReminders };
