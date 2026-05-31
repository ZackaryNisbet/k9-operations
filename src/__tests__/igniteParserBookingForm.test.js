import { describe, expect, it } from "vitest";
import { parseRegex, parseIgniteEmail, normalizePhone } from "../ignite/parser.js";

// The real K9 Resorts booking/availability form, as delivered by the Mailgun
// whitelabel (cloudbackend.net): a <th>Label</th><td><div>Value</div></td> table
// with no data-field attributes. (Trimmed from the attached .eml sample.)
const BOOKING_FORM_HTML = `
<p>A new lead has been captured on:<br>https://www.k9resorts.com/cherry-hill/</p>
<table cellpadding="0" cellspacing="0"><tbody>
  <tr><th>First Name: </th><td><div>Janelle</div></td></tr>
  <tr><th>Last Name: </th><td><div>Martinez</div></td></tr>
  <tr><th>Email: </th><td><div>JMBMartinez.jmm@gmail.com</div></td></tr>
  <tr><th>Phone: </th><td><div>8567018139</div></td></tr>
  <tr><th>Zip Code: </th><td><div>08003</div></td></tr>
  <tr><th>Desired Service: </th><td><div>Dog Boarding</div></td></tr>
  <tr><th>Desired Date of boarding or day care: </th><td><div>June 25th to July 1st </div></td></tr>
  <tr><th>Preferred time to be reached: </th><td><div></div></td></tr>
  <tr><th>Details: </th><td><div>1 dog, email or text is good</div></td></tr>
  <tr><th>Form Name: </th><td><div>Booking</div></td></tr>
  <tr><th>*: </th><td><div>True</div></td></tr>
</tbody></table>`;

describe("parseRegex on the booking form (th/td rows)", () => {
  const fields = parseRegex(BOOKING_FORM_HTML);

  it("extracts the labelled fields", () => {
    expect(fields.first_name).toBe("Janelle");
    expect(fields.last_name).toBe("Martinez");
    expect(fields.email).toBe("JMBMartinez.jmm@gmail.com");
    expect(fields.phone).toBe("8567018139");
    expect(fields.zip_code).toBe("08003");
    expect(fields.desired_service).toBe("Dog Boarding");
    expect(fields.desired_date_of_boarding_or_day_care).toBe("June 25th to July 1st");
    expect(fields.details).toBe("1 dog, email or text is good");
    expect(fields.form_name).toBe("Booking");
  });

  it("drops empty values and unlabelled rows", () => {
    expect(fields.preferred_time_to_be_reached).toBeUndefined(); // empty value
    expect(fields[""]).toBeUndefined(); // the "*:" row has no usable key
  });
});

describe("parseIgniteEmail on the booking form", () => {
  const lead = parseIgniteEmail(
    BOOKING_FORM_HTML,
    { from: "K9 Resorts <no-reply@cloudbackend.net>", subject: "New Booking Form Submission Received" },
    { useRegex: true }
  );

  it("classifies as a web form and builds a clean lead", () => {
    expect(lead.error).toBeUndefined();
    expect(lead.leadType).toBe("web_form");
    expect(lead.clientName).toBe("Janelle Martinez");
    expect(lead.email).toBe("jmbmartinez.jmm@gmail.com"); // lowercased
    expect(lead.phone).toBe(normalizePhone("8567018139")); // 18567018139
    expect(lead.formName).toBe("Booking");
    expect(lead.senderKnown).toBe(true);
  });

  it("keeps the remaining form fields in form_data (not the promoted ones)", () => {
    expect(lead.formData.desired_service).toBe("Dog Boarding");
    expect(lead.formData.zip_code).toBe("08003");
    expect(lead.formData.details).toBe("1 dog, email or text is good");
    expect(lead.formData.first_name).toBeUndefined();
    expect(lead.formData.email).toBeUndefined();
  });

  it("still parses when forwarding has rewritten the sender", () => {
    const forwarded = parseIgniteEmail(
      BOOKING_FORM_HTML,
      { from: "Zack <zack@gmail.com>", subject: "Fwd: New Booking Form Submission Received" },
      { useRegex: true }
    );
    expect(forwarded.error).toBeUndefined();
    expect(forwarded.clientName).toBe("Janelle Martinez");
    expect(forwarded.senderKnown).toBe(false); // unknown sender, but still parsed
  });

  it("rejects an email with no recognizable fields", () => {
    const empty = parseIgniteEmail("<p>hello</p>", { from: "x@y.com" }, { useRegex: true });
    expect(empty.error).toBeTruthy();
  });
});
