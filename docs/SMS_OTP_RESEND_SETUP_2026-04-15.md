# SMS OTP + Resend Setup Guide — April 15, 2026

## Recommended provider decision

### SMS OTP
- Preferred: `Stytch`
- Fallback: `Twilio Verify`

Why:
- Stytch is the cleanest fit for the “sign up, get keys, wire an OTP API” requirement.
- Twilio Verify is still a strong fallback, but it is a heavier operational product and will usually involve more console setup than Stytch.

### Email
- Preferred: `Resend`

Why:
- It is the lightest transactional-email path for this product.
- It fits the current Supabase edge-function architecture well.
- The domain + sender setup is straightforward and predictable.

## Product recommendation

### Where SMS OTP makes sense
- Vendor sign-in / sign-out on a shared iPad
- Untrusted or semi-trusted incident submissions
- Any workflow where the submitter might not already be authenticated in K9 Operations

### Where SMS OTP is probably too much friction
- Routine employee submissions where the employee is already signed in and tied to the labor roster
- Repetitive internal workflows completed multiple times per shift

### Recommended identity model
- Default for authenticated employees:
  - signed-in account identity
  - roster-backed phone match
  - visible “verified” / “unverified” status
  - optional typed or drawn signature only where needed
- Stronger verification for vendors and edge cases:
  - SMS OTP at check-in
  - SMS OTP at self-service check-out
  - explicit fallback flag when staff complete check-out without vendor verification

## Stytch setup

### 1. Create the project
- Create a Stytch workspace/project for K9 Operations.
- Enable SMS OTP in the dashboard.
- Keep sandbox and production credentials separate.

### 2. Add environment secrets
- Add these as Supabase secrets for the edge-function layer:
  - `STYTCH_PROJECT_ID`
  - `STYTCH_SECRET`
  - `STYTCH_ENVIRONMENT`

### 3. Persist the chosen provider in K9 settings
- Use `lite_settings.setting_key = sms_otp_provider_config`
- Recommended payload:

```json
{
  "preferred": "stytch",
  "fallback": "twilio_verify"
}
```

### 4. Wire the adapter
- Implement `SmsOtpProvider` with:
  - `sendCode(phoneNumber, context)`
  - `checkCode(phoneNumber, code, context)`
  - normalized result states:
    - `verified`
    - `invalid_code`
    - `expired`
    - `provider_error`

### 5. Use it in the product
- Vendor Log
- Incident submit verification
- Any future external signoff workflow

## Twilio Verify fallback setup

### Use only if Stytch is rejected or blocked
- Create a Twilio Verify service.
- Add these Supabase secrets:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_VERIFY_SERVICE_SID`

### Persist provider selection

```json
{
  "preferred": "twilio_verify",
  "fallback": "twilio_sms"
}
```

## Resend setup

### 1. Verify the domain
- Verify `canineoperations.com` inside Resend.
- Add the required DNS records at the DNS provider.

### 2. Create the sender identity
- Recommended sender:
  - `noreply@canineoperations.com`
- Recommended reply path for incident flows:
  - set `replyTo` to the submitter email when available

### 3. Add Supabase secrets
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_DEFAULT`

### 4. Persist provider selection
- Use `lite_settings.setting_key = transactional_email_provider_config`

```json
{
  "preferred": "resend"
}
```

### 5. Use it for
- Incident notification blasts
- CC to the submitter
- Future daily briefing / alert emails if needed

## Recommended rollout order
1. Finish the adapter implementation with Stytch + Resend behind provider interfaces.
2. Add an internal admin/settings test surface:
   - send OTP test
   - verify OTP test
   - send incident email test
3. Turn on vendor log OTP first.
4. Turn on incident-submit verification second.
5. Only then decide whether authenticated employees should ever be forced through OTP.

## Current blocker summary
- The provider-selection/config scaffolding exists in the codebase.
- Live provider wiring does **not**.
- That next pass is primarily integration work, not product-structure work.
