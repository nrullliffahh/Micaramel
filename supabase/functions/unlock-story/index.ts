const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VerificationResult = {
  ok: boolean;
  kind?: string;
  message?: string;
  retry_after_seconds?: number;
};

function isVerificationResult(value: unknown): value is VerificationResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }

  return typeof value.ok === "boolean" &&
    (!("kind" in value) || typeof value.kind === "string") &&
    (!("message" in value) || typeof value.message === "string") &&
    (!("retry_after_seconds" in value) ||
      typeof value.retry_after_seconds === "number");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function hashClientKey(clientAddress: string, pepper: string) {
  const bytes = new TextEncoder().encode(`${pepper}:${clientAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, message: "Method not allowed." }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("Secret-code request contained invalid JSON:", error);
    return jsonResponse({ ok: false, message: "Invalid request." }, 400);
  }

  const code =
    typeof body === "object" && body !== null && "code" in body
      ? body.code
      : null;

  if (typeof code !== "string" || !/^\d{4}$/.test(code)) {
    return jsonResponse({
      ok: false,
      kind: "invalid_request",
      message: "Enter a valid four-digit code.",
    }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase URL or service-role key is not configured.");
    return jsonResponse({
      ok: false,
      message: "The secret-code service is not configured yet.",
    }, 500);
  }

  const forwardedAddress = request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const clientKeyHash = await hashClientKey(forwardedAddress, serviceRoleKey);

  let rpcResponse: Response;
  try {
    rpcResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/verify_story_code`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_code: code,
          p_client_key_hash: clientKeyHash,
        }),
      },
    );
  } catch (error) {
    console.error("Could not reach the Supabase secret-code RPC:", error);
    return jsonResponse({
      ok: false,
      message: "Couldn't connect right now. Please try again in a moment.",
    }, 502);
  }

  if (!rpcResponse.ok) {
    const details = await rpcResponse.text();
    console.error("Supabase secret-code RPC failed:", rpcResponse.status, details);
    return jsonResponse({
      ok: false,
      message: "Couldn't check the code right now. Please try again.",
    }, 502);
  }

  const result: unknown = await rpcResponse.json();
  if (!isVerificationResult(result)) {
    console.error("Supabase secret-code RPC returned an invalid response.");
    return jsonResponse({
      ok: false,
      message: "Couldn't check the code right now. Please try again.",
    }, 502);
  }

  const status = result.kind === "rate_limited" ? 429 : 200;
  return jsonResponse(result, status);
});
