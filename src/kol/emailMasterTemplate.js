// K9 Resorts master email template — the on-brand starting point a new campaign opens
// with in the Stripo editor. Navy (#183661) + gold (#AF8D54), table-based + inline styles
// for cross-client rendering. Merge tags ({{first_name}}, {{unsubscribe_url}}, …) are
// substituted at send time. Marketers edit everything visually from here; they can drop
// the real logo image in to replace the wordmark.

import { K9_RESORTS_BRAND } from "./campaignsData.js";

const { navy, gold, ink, muted } = K9_RESORTS_BRAND;

export const K9_RESORTS_MASTER_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>K9 Resorts</title></head>
<body style="margin:0;padding:0;background:#F4F6F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E5E7EB;">
        <!-- Header -->
        <tr><td style="background:${navy};padding:26px 32px;text-align:center;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:800;letter-spacing:0.04em;color:#FFFFFF;">K9&nbsp;RESORTS</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;color:${gold};margin-top:4px;text-transform:uppercase;">Luxury Pet Hotel</div>
        </td></tr>
        <!-- Gold rule -->
        <tr><td style="height:4px;background:${gold};line-height:4px;font-size:0;">&nbsp;</td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 36px 8px 36px;font-family:Arial,Helvetica,sans-serif;color:${ink};">
          <p style="margin:0 0 16px;font-size:16px;">Hi {{first_name}},</p>
          <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:${navy};font-weight:800;">A little something for you and your pup</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${ink};">
            Tell your story here. Replace this text with your message — share an offer, an update, or an invitation to come see why pet parents trust K9 Resorts with the dogs they love.
          </p>
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding:8px 36px 36px 36px;font-family:Arial,Helvetica,sans-serif;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:${gold};">
              <a href="https://www.k9resorts.com" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Book a stay</a>
            </td>
          </tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:22px 36px;background:#F8FAFC;border-top:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${muted};text-align:center;">
          <div style="font-weight:700;color:${navy};">K9 Resorts Luxury Pet Hotel</div>
          <div style="margin-top:4px;">You're receiving this because you contacted us about our services.</div>
          <div style="margin-top:8px;"><a href="{{unsubscribe_url}}" style="color:${navy};text-decoration:underline;">Unsubscribe</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

export const K9_RESORTS_MASTER_TEMPLATE = { html: K9_RESORTS_MASTER_HTML, css: "" };
