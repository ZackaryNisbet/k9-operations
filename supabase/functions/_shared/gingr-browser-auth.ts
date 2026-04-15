export interface GingrCredentials {
  subdomain: string;
  apiKey: string;
}

export const GINGR_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function extractSetCookies(resp: Response): string[] {
  if (typeof resp.headers.getSetCookie === "function") {
    return resp.headers.getSetCookie();
  }
  const raw = resp.headers.get("set-cookie") || "";
  return raw ? raw.split(/,\s*(?=[a-zA-Z_]+=)/) : [];
}

export function parseCookieValue(cookieHeaders: string[], name: string): string {
  for (const header of cookieHeaders) {
    const match = header.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return "";
}

function looksLikeHtml(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<body");
}

export async function gingrWebLogin(subdomain: string, apiKey: string): Promise<string> {
  const baseUrl = `https://${subdomain}.gingrapp.com`;

  const loginPageResp = await fetch(`${baseUrl}/auth/login`, {
    redirect: "manual",
    headers: { "User-Agent": GINGR_UA },
  });
  const step1Cookies = extractSetCookies(loginPageResp);
  const loginHtml = await loginPageResp.text();

  const sessionVal = parseCookieValue(step1Cookies, "gingr_ci_session");
  const csrfCookieVal = parseCookieValue(step1Cookies, "gingr_csrf_cookie_name");
  const csrfMatch = loginHtml.match(/name="gingr_csrf_token"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] || "";

  if (!csrfToken || !sessionVal) {
    throw new Error("Failed to extract Gingr browser session cookies from /auth/login.");
  }

  const cookieHeader = [
    `gingr_ci_session=${sessionVal}`,
    csrfCookieVal ? `gingr_csrf_cookie_name=${csrfCookieVal}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const loginResp = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader,
      "User-Agent": GINGR_UA,
    },
    body: `identity=${encodeURIComponent(apiKey)}&password=${encodeURIComponent(apiKey)}&gingr_csrf_token=${encodeURIComponent(csrfToken)}`,
  });

  const step2Cookies = extractSetCookies(loginResp);

  let authSessionVal = "";
  for (const header of step2Cookies) {
    const match = header.match(/gingr_ci_session=([^;]+)/);
    if (match) authSessionVal = match[1];
  }
  const authCsrfVal = parseCookieValue(step2Cookies, "gingr_csrf_cookie_name");

  const parts: string[] = [];
  if (authSessionVal || sessionVal) {
    parts.push(`gingr_ci_session=${authSessionVal || sessionVal}`);
  }
  if (authCsrfVal || csrfCookieVal) {
    parts.push(`gingr_csrf_cookie_name=${authCsrfVal || csrfCookieVal}`);
  }
  parts.push(`gingr_subdomain=${subdomain}`);

  return parts.join("; ");
}

export async function gingrWebGetJson(
  subdomain: string,
  cookies: string,
  path: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  const url = new URL(`https://${subdomain}.gingrapp.com/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const resp = await fetch(url.toString(), {
    redirect: "manual",
    headers: {
      "Cookie": cookies,
      "User-Agent": GINGR_UA,
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": `https://${subdomain}.gingrapp.com/`,
    },
  });

  if (resp.status === 301 || resp.status === 302) {
    throw new Error(`Gingr redirected ${path}; browser session is not authenticated.`);
  }

  const text = await resp.text();
  if (looksLikeHtml(text)) {
    throw new Error(`Gingr returned HTML for ${path}; expected JSON from the browser route.`);
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error(`Gingr returned non-JSON from ${path}: ${text.slice(0, 160)}`);
  }
}

export async function fetchReservationViewJson(
  subdomain: string,
  cookies: string,
  reservationId: string,
): Promise<any> {
  const payload = await gingrWebGetJson(subdomain, cookies, "reservations/view_json", {
    r_id: reservationId,
  });
  return payload?.data ?? payload;
}

export async function fetchAnimalViewJson(
  subdomain: string,
  cookies: string,
  animalId: string,
): Promise<any> {
  const payload = await gingrWebGetJson(subdomain, cookies, "animals/view_json", {
    animal_id: animalId,
  });
  return payload?.data ?? payload;
}

export async function fetchOwnerViewJson(
  subdomain: string,
  cookies: string,
  apiKey: string,
  options: {
    type: "owner" | "animal" | "reservation";
    id?: string;
    animalId?: string;
    reservationId?: string;
  },
): Promise<any> {
  const payload = await gingrWebGetJson(subdomain, cookies, "owners/view_json", {
    type: options.type,
    key: apiKey,
    id: options.type === "owner" ? options.id : null,
    animal_id: options.type === "animal" ? options.animalId : null,
    reservation_id: options.type === "reservation" ? options.reservationId : null,
  });
  return payload?.data ?? payload;
}

export async function fetchReservationFormData(
  subdomain: string,
  cookies: string,
  reservationId: string,
): Promise<any> {
  return gingrWebGetJson(subdomain, cookies, "forms/get_data", {
    id: reservationId,
    form: "reservation_form",
  });
}
