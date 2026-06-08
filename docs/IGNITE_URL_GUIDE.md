# Ignite Email & URL Structure Guide

> Comprehensive reference for parsing Ignite Visibility lead notification emails
> received by K9 Operations via Resend inbound webhooks.
>
> Last updated: 2026-03-15

---

## Table of Contents

1. [Email Delivery Pipeline](#1-email-delivery-pipeline)
2. [Email Types](#2-email-types)
3. [HTML Structure](#3-html-structure)
4. [Data Fields by Email Type](#4-data-fields-by-email-type)
5. [URL Patterns](#5-url-patterns)
6. [Recording URL Deep Dive](#6-recording-url-deep-dive)
7. [Profile ID Extraction](#7-profile-id-extraction)
8. [Subscribe/Unsubscribe Email Encoding](#8-subscribeunsubscribe-email-encoding)
9. [Quotable Vote Parameters](#9-quotable-vote-parameters)
10. [Known Edge Cases](#10-known-edge-cases)
11. [Appendix: Real Email Samples](#11-appendix-real-email-samples)

---

## 1. Email Delivery Pipeline

```
Ignite Visibility Platform
  ↓ sends email to zack.nisbet@lphik9.com
  ↓ forwarding rule sends copy to leads@inbound.k9operations.com
  ↓
Resend Inbound (receives email, stores raw HTML)
  ↓ fires webhook: POST { type: "email.received", data: { email_id: "<uuid>" } }
  ↓
Supabase Edge Function: ignite-webhook/index.ts
  ↓ calls Resend API: GET /emails/received/{email_id} → gets { from, to, subject, html, text }
  ↓ parses HTML → extracts fields
  ↓ matches to Gingr clients
  ↓ inserts into ignite_leads table
```

### Key Identifiers

| Entity | Value |
|--------|-------|
| Ignite sender | `noreply@leads.idigitalstrategies.com` |
| Ignite sender display name | `K9 Resorts` (lead emails) or `Ignite Visibility` (OTP emails) |
| Forwarding destination | `leads@inbound.k9operations.com` |
| Cherry Hill profile ID | `156865` |
| Deerfield profile ID | `156866` |
| Account ID | `106348` |

---

## 2. Email Types

### 2.1 Phone Call Notification

- **Subject pattern:** `New Phone Call Received | {Location Name}`
- **Example:** `New Phone Call Received | Cherry Hill`
- **H2 heading in body:** `New Phone Call!`
- **Source line:** `This lead came from <strong>{source}</strong>.`
- **Unique fields:** Recording (Play/Download links), Call Transcription, Caller Name, Tracking Number, Destination Number, Caller Number, Answer Status, Line Type, Call Duration, Phone Name

### 2.2 Appointment Notification

- **Subject pattern:** `New Appointment Received | {Location Name}`
- **Example:** `New Appointment Received | Cherry Hill`
- **H2 heading in body:** `New Appointment!`
- **Source line:** `This lead came from <strong>{source}</strong>.`
- **Unique fields:** Lead Page, Landing Page, Browser, Device, Sales Value, BookingTitle, Services (JSON), Dates, EstimatedSubtotal, EstimatedTax, EstimatedTotal, AgreedToTerms

### 2.3 Verification Code (OTP)

- **Subject pattern:** `Verification Code | Ignite Visibility`
- **Not a lead email — used for portal login only**
- **Contains:** 6-digit code, request time, browser/OS/device info, IP address

### 2.4 Potential Future Types (not yet observed)

- `New Ad Click Received | {Location Name}` — may exist based on codebase constants
- `New Web Form Received | {Location Name}` — may exist for contact form submissions

---

## 3. HTML Structure

### Overall Layout

All Ignite lead emails follow an identical HTML table structure:

```
<!DOCTYPE html XHTML 1.0 Transitional>
<html>
  <head>
    <title>{Subject Line}</title>
    <style>responsive media query</style>
  </head>
  <body style="background: #F1F6FB; ...">
    <table class="main-table">
      ├── HEADER ROW: K9 Resorts logo + "Log in" link
      ├── CONTENT ROW:
      │   ├── H2 heading ("New Phone Call!" / "New Appointment!")
      │   ├── Source paragraph
      │   ├── DATA TABLE: field rows (label | value)
      │   ├── QUOTABLE SECTION: Yes/No/Pending vote buttons
      │   └── MORE INFO SECTION: "View All Lead Details" button
      └── FOOTER ROW: "Manage Notifications" + "Unsubscribe" links
    </table>
  </body>
</html>
```

### Critical Parsing Facts

1. **NO `data-field` attributes exist.** The codebase's sample emails used fabricated `data-field="caller_name"` attributes. Real emails have NONE of these. The parser must use table row label matching instead.

2. **Field labels are in the first `<td>` of each `<tr>`.** They are plain text with styling — no special attributes.

3. **Field values are in the second `<td>` of each `<tr>`.** Some contain nested `<a>` tags (recording links, lead page URLs), `<br>` tags (transcription), or raw text.

4. **The profile ID is NOT a field in the data table.** It is only embedded within href URLs (see Section 7).

5. **The data table has consistent CSS:** Each `<tr>` has two `<td>` cells. The label cell has `color: #747E97` styling. Rows are separated by `border-top: 1px solid #DDE5EC`.

### Data Table Row HTML Pattern

```html
<tr>
  <td style="...border-top: 1px solid #DDE5EC; ...color: #747E97;..." valign="top">
    {Label}
  </td>
  <td style="...border-top: 1px solid #DDE5EC;..." valign="top">
    {Value — may contain <a>, <br>, or plain text}
  </td>
</tr>
```

---

## 4. Data Fields by Email Type

### 4.1 Phone Call Fields

| Label (exact text in HTML) | Data Type | Contains Links? | Notes |
|----------------------------|-----------|-----------------|-------|
| Time | Text | No | Format: `MM/DD/YYYY at H:MM AM/PM` |
| Profile | Text | No | Location name, e.g., "Cherry Hill" |
| Phone Name | Text | No | Tracking source name |
| Tracking Number | Text | No | Format: `+1 XXX-XXX-XXXX` |
| Destination Number | Text | No | Format: `+1 XXX-XXX-XXXX` |
| Caller Number | Text | No | Format: `+1 XXX-XXX-XXXX` |
| Caller Name | Text | No | Format: `{LastName} {FirstName}` (REVERSED!) |
| City | Text | No | |
| State | Text | No | Abbreviation (e.g., "WA") |
| Zip | Text | No | |
| Country | Text | No | ISO 2-letter (e.g., "US") |
| Answer Status | Text | No | "Answered", "Missed", "Voicemail" |
| Line Type | Text | No | "Mobile", "Landline", etc. |
| Call Duration | Text | No | Natural language, e.g., "1 minute and 18 seconds" |
| Recording | HTML | **Yes** | Contains Play + Download `<a>` links |
| Call Transcription | HTML | No | Contains `<br>` separated speaker turns |
| Multi Unit Name | Text | No | Often empty |
| Lead ID | Text | No | Numeric string, e.g., "225014635" |

**Important: Caller Name is REVERSED.** The format is `{LastName} {FirstName}`, not the typical `{FirstName} {LastName}`. Example: "Mack Elizabeth" means first_name="Elizabeth", last_name="Mack".

### 4.2 Appointment Fields

| Label (exact text in HTML) | Data Type | Contains Links? | Notes |
|----------------------------|-----------|-----------------|-------|
| Time | Text | No | Format: `MM/DD/YYYY at H:MM AM/PM` |
| Profile | Text | No | Location name |
| Lead Page | HTML | **Yes** | Gingr portal URL with UTM params |
| Landing Page | HTML | **Yes** | K9 Resorts website URL |
| Browser | Text | No | e.g., "Chrome 145 on Windows 10" |
| Device | Text | No | "Desktop", "Mobile", "Tablet" |
| City | Text | No | |
| State | Text | No | Full name (e.g., "New Jersey") — different from phone call! |
| Zip | Text | No | |
| Country | Text | No | Full name (e.g., "United States") — different from phone call! |
| Sales Value | Text | No | Format: `$XXX.XX` |
| Multi Unit Name | Text | No | Often empty |
| BookingTitle | Text | No | e.g., "Boarding \| Boarding \| Executive Room (All Inclusive) Request for {PetName}" |
| Services | JSON | No | JSON array string: `[{"Name":"...","Quantity":"QTY","Rate":"$XXX.XX"}]` |
| Dates | Text | No | Complex multi-line with dates, add-ons, subtotal, tax, total |
| EstimatedSubtotal | Text | No | Numeric, e.g., "256.00" |
| EstimatedTax | Text | No | Numeric, e.g., "14.38" |
| EstimatedTotal | Text | No | Sometimes contains "Estimated Subtotal" as text (appears buggy) |
| AgreedToTerms | Text | No | "true" or "false" |
| Lead ID | Text | No | Numeric string |

**Note:** Appointment emails do NOT have a Caller Name field. There is no contact name, email, or phone in the appointment email body. The only identifying info is the booking details.

---

## 5. URL Patterns

### 5.1 Complete URL Inventory

Every URL that appears in an Ignite lead notification email:

| Purpose | URL Pattern | Present In |
|---------|-------------|------------|
| **Log In** (header) | `https://leads.idigitalstrategies.com/` | Both |
| **Recording Play** | `https://leads.idigitalstrategies.com/recording/{HASH}/play` | Phone Call only |
| **Recording Download** | `https://leads.idigitalstrategies.com/recording/{HASH}/download` | Phone Call only |
| **Lead Page** | `https://your-gingr-subdomain.portal.gingrapp.com/public/login/?utm_source={src}&utm_medium={med}&landing_page={url}` | Appointment only |
| **Landing Page** | `https://www.k9resorts.com/{location}/` | Appointment only |
| **Quotable: Yes** | `https://leads.idigitalstrategies.com/profile/{PROFILE_ID}/leads?lid={LEAD_ID}&qv=MQ` | Both |
| **Quotable: No** | `https://leads.idigitalstrategies.com/profile/{PROFILE_ID}/leads?lid={LEAD_ID}&qv=Mg` | Both |
| **Quotable: Pending** | `https://leads.idigitalstrategies.com/profile/{PROFILE_ID}/leads?lid={LEAD_ID}&qv=Mw` | Both |
| **View All Lead Details** | `https://leads.idigitalstrategies.com/profile/{PROFILE_ID}/leads?lid={LEAD_ID}` | Both |
| **Manage Notifications** | `https://leads.idigitalstrategies.com/subscribe?e={BASE64_EMAIL}` | Both |
| **Unsubscribe** | `https://leads.idigitalstrategies.com/subscribe?e={BASE64_EMAIL}` | Both |
| **K9 Resorts Logo** | `https://df8axwi1m4fag.cloudfront.net/12982-1767892968.jpg` | Both (image, not link) |
| **Log In Icon** | `https://df8axwi1m4fag.cloudfront.net/shared/email_login.png` | Both (image) |

### 5.2 Ignite Portal URL Taxonomy

```
https://leads.idigitalstrategies.com/
├── /profile/{PROFILE_ID}/                          → Profile dashboard
├── /profile/{PROFILE_ID}/leads                     → Leads list
├── /profile/{PROFILE_ID}/leads?lid={LEAD_ID}       → Lead detail (via query param)
├── /profile/{PROFILE_ID}/leads/{LEAD_ID}           → Lead detail (via path — portal UI format)
├── /profile/{PROFILE_ID}/leads?lid={LID}&qv={QV}   → Quotable vote action
├── /recording/{HASH}/play                          → Play recording in browser
├── /recording/{HASH}/download                      → Download recording file
├── /recording/{HASH}/download?seq={SEQ}            → Download with sequence (API redirect)
├── /account/{ACCOUNT_ID}/profiles                  → Account profile management
└── /subscribe?e={BASE64_EMAIL}                     → Notification preferences
```

---

## 6. Recording URL Deep Dive

### Hash Format

```
RE + 32 hex characters (lowercase)
```

- Prefix: Always `RE` (uppercase)
- Hash body: 32 lowercase hexadecimal characters (resembles MD5)
- Total length: 34 characters

**Examples:**
- `RE884711cffa9f142c806ebf2c1a7ef00d`
- `REf5669bf010488440f2c3e47853c05fe2`

### Play vs Download

| Action | URL | Behavior |
|--------|-----|----------|
| Play | `/recording/{HASH}/play` | Opens audio player in browser |
| Download | `/recording/{HASH}/download` | Downloads audio file |
| Download (API) | `/recording/{HASH}/download?seq={SEQ}` | Same download with sequence tracking |

### Sequence Parameter (`seq`)

The `seq` parameter appears when the download URL is accessed and may redirect. It changes per request (observed values: 12193, 18624, 77115, 81101 for the same recording). It is NOT needed for direct download — the URL without `seq` works fine.

### Extracting from HTML

The recording links are inside the "Recording" row's value cell:

```html
<td>
  <a href="https://leads.idigitalstrategies.com/recording/RE.../play" ...>Play</a>
  |
  <a href="https://leads.idigitalstrategies.com/recording/RE.../download" ...>Download</a>
</td>
```

**Regex to extract recording hash:**
```
/recording\/(RE[0-9a-f]{32})\//
```

---

## 7. Profile ID Extraction

### The Problem

The profile ID (e.g., `156865` for Cherry Hill) is **NOT** a visible field in the data table. It only appears embedded in href URLs within the email HTML.

### Where Profile ID Appears

1. **Quotable Yes/No/Pending buttons:** `...profile/156865/leads?lid=...&qv=...`
2. **View All Lead Details button:** `...profile/156865/leads?lid=...`

### Extraction Strategy

Extract profile ID from any URL containing `/profile/{digits}/`:

```
/\/profile\/(\d+)\//
```

This will match on the "View All Lead Details" href, the Yes/No/Pending hrefs — any of them. The profile ID is the same across all URLs in a single email.

### Lead ID Extraction

The Lead ID appears in TWO places:
1. **As a text field** in the data table: `<td>Lead ID</td><td>225014635</td>`
2. **In URLs** as the `lid` query parameter: `?lid=225014635`

Always prefer the text field extraction — it's simpler and more reliable.

---

## 8. Subscribe/Unsubscribe Email Encoding

The `e` parameter in subscribe/unsubscribe URLs is the recipient's email address encoded in **standard Base64**:

```
emFjay5uaXNiZXRAbHBoaWs5LmNvbQ → zack.nisbet@lphik9.com
```

This is not relevant for parsing leads, but documents the pattern for completeness. Both "Manage Notifications" and "Unsubscribe" use the same URL.

---

## 9. Quotable Vote Parameters

The `qv` query parameter encodes the vote value in **standard Base64**:

| Button | `qv` value | Decoded |
|--------|-----------|---------|
| Yes | `MQ` | `1` |
| No | `Mg` | `2` |
| Pending | `Mw` | `3` |

Not relevant for parsing, but documents the pattern.

---

## 10. Known Edge Cases

### 10.1 Caller Name Reversal
Phone call emails list the caller name as `{Last} {First}` — e.g., "Mack Elizabeth" means Elizabeth Mack. The parser must split and reverse.

### 10.2 State/Country Format Inconsistency
- **Phone calls:** State as abbreviation ("WA"), Country as ISO code ("US")
- **Appointments:** State as full name ("New Jersey"), Country as full name ("United States")

### 10.3 Empty Multi Unit Name
The "Multi Unit Name" field is present but often empty. The `<td>` value cell exists but contains no text.

### 10.4 Appointment EstimatedTotal Bug
The "EstimatedTotal" field sometimes contains "Estimated Subtotal" as text instead of a number. This appears to be an Ignite bug. Parser should handle non-numeric values gracefully.

### 10.5 Services JSON in Text Cell
The "Services" field contains a raw JSON array string inside a plain `<td>`. It's not wrapped in `<code>` or any special element. Example:
```
[{"Name":"BATH (1)","Quantity":"QTY","Rate":"$217.00"}]
```

### 10.6 Dates Field is Compound
The "Dates" row contains a complex multi-value cell with drop-off date, pick-up date, add-on names, subtotal, tax, and total — all pipe-separated after HTML tag stripping. Needs special parsing logic.

### 10.7 Call Transcription Contains HTML
The transcription uses `<br />` and `<br /><br />` for line breaks and paragraph breaks. Speaker labels ("Caller", "Recipient") are interspersed with dialogue text separated by `<br />`.

### 10.8 No Contact Info in Appointment Emails
Unlike phone call emails (which have Caller Name, Caller Number), appointment emails contain NO personal contact information (no name, email, or phone). The only identifying information is the booking details (pet name in BookingTitle, services requested).

### 10.9 Lead Page URL May Vary
The Lead Page href in appointment emails follows this pattern:
```
https://{subdomain}.portal.gingrapp.com/public/login/?utm_source={src}&utm_medium={med}&landing_page={url}
```
The subdomain (e.g., `your-gingr-subdomain`) and UTM parameters will vary per lead.

---

## 11. Appendix: Real Email Samples

Complete raw HTML samples are stored in the repository:
- `src/ignite/samples/phone_call_real.html`
- `src/ignite/samples/appointment_real.html`

These should be used for parser development and testing, replacing the fabricated samples in `src/ignite/sampleEmails.js`.
