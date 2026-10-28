const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
};

const allowedCollections = new Set(["map", "match", "cafe"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hasValidSession(request: Request, secret: string) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (
      header.alg !== "HS256" ||
      payload.scope !== "story-journal" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

function isValidPhotoSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 3_000_000) return false;
  return value.startsWith("data:image/jpeg;base64,") ||
    value.startsWith("data:image/png;base64,") ||
    value.startsWith("data:image/webp;base64,") ||
    value.startsWith("./") ||
    /^https:\/\//i.test(value);
}

function isValidEntry(collection: string, value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) ||
    typeof entry.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !Array.isArray(entry.photos) ||
    entry.photos.length > 12 ||
    !entry.photos.every((photo) =>
      typeof photo === "object" &&
      photo !== null &&
      !Array.isArray(photo) &&
      isValidPhotoSource((photo as Record<string, unknown>).src) &&
      (
        typeof (photo as Record<string, unknown>).alt === "undefined" ||
        typeof (photo as Record<string, unknown>).alt === "string"
      )
    )
  ) {
    return false;
  }

  if (collection === "map") {
    return typeof entry.place === "string" &&
      entry.place.length <= 160 &&
      (
        typeof entry.note === "undefined" ||
        (typeof entry.note === "string" && entry.note.length <= 2000)
      ) &&
      Number.isInteger(entry.year) &&
      entry.year === Number(entry.date.slice(0, 4)) &&
      typeof entry.x === "number" &&
      entry.x >= 0 &&
      entry.x <= 100 &&
      typeof entry.y === "number" &&
      entry.y >= 0 &&
      entry.y <= 100;
  }

  if (collection === "cafe") {
    return typeof entry.name === "string" &&
      entry.name.length <= 160 &&
      typeof entry.note === "string" &&
      entry.note.length <= 2000;
  }

  return collection === "match";
}

async function uploadPhoto(
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  collection: string,
) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id") ?? "";
  const photoIndex = Number(url.searchParams.get("photo_index"));
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();

  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(entryId) ||
    !Number.isInteger(photoIndex) ||
    photoIndex < 0 ||
    photoIndex >= 12 ||
    typeof contentType !== "string" ||
    !["image/jpeg", "image/png", "image/webp"].includes(contentType)
  ) {
    return jsonResponse({ message: "Photo upload details are invalid." }, 400);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_388_608) {
    return jsonResponse({ message: "Each photo must be smaller than 8 MB." }, 413);
  }

  try {
    const photo = await request.arrayBuffer();
    if (photo.byteLength === 0 || photo.byteLength > 8_388_608) {
      return jsonResponse({ message: "Each photo must be smaller than 8 MB." }, 413);
    }

    const extension = contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
      ? "png"
      : "webp";
    const objectPath = `${collection}/${entryId}/${photoIndex}.${extension}`;
    const storageUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/story-journal-photos/${objectPath}`;
    const response = await fetch(storageUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": contentType,
        "Cache-Control": "31536000",
        "x-upsert": "true",
      },
      body: photo,
    });

    if (!response.ok) {
      console.error("Could not upload journal photo:", response.status, await response.text());
      return jsonResponse({ message: "The photo could not be uploaded to storage." }, 502);
    }

    return jsonResponse({
      src: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/story-journal-photos/${objectPath}`,
    });
  } catch (error) {
    console.error("Could not upload journal photo:", error);
    return jsonResponse({ message: "The photo could not be uploaded to storage." }, 502);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "PUT") {
    return jsonResponse({ message: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase journal service environment is not configured.");
    return jsonResponse({ message: "The journal service is not configured." }, 500);
  }

  if (!await hasValidSession(request, serviceRoleKey)) {
    return jsonResponse({ message: "Your secret-code session expired. Enter the code again." }, 401);
  }

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  if (!collection || !allowedCollections.has(collection)) {
    return jsonResponse({ message: "Choose a valid journal." }, 400);
  }

  if (request.method === "PUT" && url.searchParams.get("upload") === "photo") {
    return await uploadPhoto(request, supabaseUrl, serviceRoleKey, collection);
  }

  if (request.method === "GET") {
    try {
      const response = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/read_story_journal`,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: "Bearer " + serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_collection: collection }),
        },
      );
      if (!response.ok) {
        console.error("Could not load journal entries:", response.status, await response.text());
        return jsonResponse({ message: "Saved memories could not be loaded." }, 502);
      }

      const entries: unknown = await response.json();
      if (
        entries !== null &&
        (
          !Array.isArray(entries) ||
          !entries.every((entry) => isValidEntry(collection, entry))
        )
      ) {
        console.error("Supabase returned invalid journal entries.");
        return jsonResponse({ message: "Saved memories had an invalid format." }, 502);
      }

      return jsonResponse({ initialized: entries !== null, entries: entries ?? [] });
    } catch (error) {
      console.error("Could not reach the Supabase journal table:", error);
      return jsonResponse({ message: "Saved memories could not be loaded." }, 502);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("Journal save request contained invalid JSON:", error);
    return jsonResponse({ message: "Invalid journal data." }, 400);
  }

  const entries =
    typeof body === "object" && body !== null && "entries" in body
      ? body.entries
      : null;
  if (
    !Array.isArray(entries) ||
    entries.length > 100 ||
    new TextEncoder().encode(JSON.stringify(entries)).length > 1_000_000 ||
    !entries.every((entry) => isValidEntry(collection, entry)) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  ) {
    return jsonResponse({
      message: "Journal details are invalid or too large to save.",
    }, 400);
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/replace_story_journal`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_collection: collection,
          p_entries: entries,
        }),
      },
    );
    if (!response.ok) {
      console.error("Could not save journal entries:", response.status, await response.text());
      return jsonResponse({
        message: "Your changes could not be saved. Please try smaller photos.",
      }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Could not reach the Supabase journal RPC:", error);
    return jsonResponse({ message: "Your changes could not be saved." }, 502);
  }
});
