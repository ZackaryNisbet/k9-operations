/**
 * Sample Ignite notification emails for testing the parser.
 * IGN-001
 */

export const SAMPLE_WEB_FORM_EMAIL = {
  subject: 'New Web Form Submission - K9 Operations Adair Forsythe',
  from: 'noreply@leads.idigitalstrategies.com',
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1a3a5c; color: #fff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">New Lead Notification</h1>
      <p style="margin: 5px 0 0; font-size: 14px;">Web Form Submission</p>
    </div>
    <div style="padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 140px; color: #555;">Lead Type</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="lead_type">Web Form</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">First Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="first_name">Casey</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Last Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="last_name">Johnson</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Email</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="email">sarah.johnson@gmail.com</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="phone">(856) 555-0142</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Service Interest</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="service_interest">Doggy Daycare</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Dog Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="dog_name">Max</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Dog Breed</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="dog_breed">Golden Retriever</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Message</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="message">I'd like to schedule a tour for my dog Max. We just moved to the Adair Forsythe area.</td>
        </tr>
      </table>
      <div style="margin-top: 20px; padding: 12px; background: #f0f4f8; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 4px;"><strong>Ignite Profile:</strong> <span data-field="ignite_profile_id">IGN-7842</span></p>
        <p style="margin: 0;"><strong>Location:</strong> <span data-field="ignite_location_id">LOC-CHR-001</span></p>
      </div>
    </div>
  </div>
</body>
</html>`,
};

export const SAMPLE_PHONE_CALL_EMAIL = {
  subject: 'New Phone Call Lead - K9 Operations Adair Forsythe',
  from: 'noreply@leads.idigitalstrategies.com',
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1a3a5c; color: #fff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">New Lead Notification</h1>
      <p style="margin: 5px 0 0; font-size: 14px;">Phone Call</p>
    </div>
    <div style="padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 140px; color: #555;">Lead Type</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="lead_type">Phone Call</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Caller Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="caller_name">Michael Rivera</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="phone">+1 (856) 555-0198</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Tracking Number</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="tracking_number">(800) 555-9001</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Call Duration</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="call_duration">2m 34s</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Call Recording</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><a href="https://recordings.idigitalstrategies.com/calls/rec-abc123.mp3" data-field="call_recording_url">Listen to Recording</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Source</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="source">Google Ads - Daycare</td>
        </tr>
      </table>
      <div style="margin-top: 20px; padding: 12px; background: #f0f4f8; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 4px;"><strong>Ignite Profile:</strong> <span data-field="ignite_profile_id">IGN-7842</span></p>
        <p style="margin: 0;"><strong>Location:</strong> <span data-field="ignite_location_id">LOC-CHR-001</span></p>
      </div>
    </div>
  </div>
</body>
</html>`,
};

export const SAMPLE_AD_CLICK_EMAIL = {
  subject: 'New Ad Click Lead - K9 Operations Adair Forsythe',
  from: 'noreply@leads.idigitalstrategies.com',
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1a3a5c; color: #fff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">New Lead Notification</h1>
      <p style="margin: 5px 0 0; font-size: 14px;">Ad Click</p>
    </div>
    <div style="padding: 20px;">
      <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 140px; color: #555;">Lead Type</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="lead_type">Ad Click</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">First Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="first_name">Jennifer</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Last Name</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="last_name">Bennett</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Email</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="email">jen.martinez@outlook.com</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="phone">856-555-0276</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Ad Campaign</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="ad_campaign">Google Ads - Dog Boarding NJ</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Landing Page</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="landing_page">k9operations.com/cherry-hill/boarding</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Service Interest</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;" data-field="service_interest">Dog Boarding</td>
        </tr>
      </table>
      <div style="margin-top: 20px; padding: 12px; background: #f0f4f8; border-radius: 4px; font-size: 12px; color: #666;">
        <p style="margin: 0 0 4px;"><strong>Ignite Profile:</strong> <span data-field="ignite_profile_id">IGN-7842</span></p>
        <p style="margin: 0;"><strong>Location:</strong> <span data-field="ignite_location_id">LOC-CHR-001</span></p>
      </div>
    </div>
  </div>
</body>
</html>`,
};

export const SAMPLE_HEADERS = {
  from: 'noreply@leads.idigitalstrategies.com',
  to: 'leads@k9operations.app',
  date: 'Wed, 12 Mar 2026 14:30:00 -0400',
  'message-id': '<abc123@leads.idigitalstrategies.com>',
};
