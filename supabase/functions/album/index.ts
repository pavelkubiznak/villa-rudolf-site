// Villa Rudolf — Edge Function `album`
// =====================================
// JEDINÁ brána ke Storage bucketu `vr-album`.
//
// Bezpečnostní model:
//  - Prohlížeč NIKDY nedrží klíč, který sahá přímo na Storage. Veškerý přístup
//    ke Storage (podpis upload URL, podpis download URL, mazání objektů) běží
//    zde, service_role klíčem, který žije jen v env této funkce.
//  - Autorizace je TOKEN POBYTU (?t=<token>), ne Supabase JWT (proto verify_jwt=false,
//    stejný model jako guest průvodce). album_id = sha256(token).hex[:16] —
//    počítáno server-side, shodně s SQL RPC (substr(encode(digest(token,'sha256'),'hex'),1,16)).
//  - Každá operace je scopnutá na album_id daného tokenu; nikdy nesáhne do cizího alba.
//  - Metadatové zápisy/čtení delegujeme na existující SECURITY DEFINER RPC vr_album_*
//    (přes service_role) — jediný zdroj pravdy pro validaci cesty, rate-limit a
//    odvození album_id. Storage operace (sign/remove) dělá tato funkce sama.
//
// Deploy: supabase functions deploy album --project-ref fpknbrzbqpalguajskut --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "vr-album";
const SIGN_TTL = 3600; // download URL platnost (s)
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_ORIGIN = "https://villarudolf.com";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

// content-type -> přípona; zároveň whitelist povolených typů (image/*)
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// sha256(token).hex[:16] — MUSÍ odpovídat SQL RPC
async function albumIdOf(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function cleanToken(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").trim();
}
function validToken(tok: string): boolean {
  return tok.length > 0 && tok.length <= 200;
}

// supabase-js vrací signedUrl buď absolutní, nebo relativní vůči /storage/v1 —
// normalizujeme na absolutní URL, kterou prohlížeč použije přímo.
function absStorageUrl(signed: string): string {
  if (/^https?:\/\//i.test(signed)) return signed;
  return SUPABASE_URL + "/storage/v1" + (signed.startsWith("/") ? signed : "/" + signed);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const action = String(body.action || "");
  const token = cleanToken(body.token);
  if (!validToken(token)) return json({ ok: false, error: "token_required" }, 401);

  const albumId = await albumIdOf(token);

  try {
    switch (action) {
      /* ---------- open: validace tokenu + počet fotek ---------- */
      case "open": {
        const { data, error } = await admin.rpc("vr_album_open", { p_token: token });
        if (error) return json({ ok: false, error: "rpc_failed" }, 500);
        return json(data);
      }

      /* ---------- list: metadata daného alba + KRÁTKÁ signed download URL ---------- */
      case "list": {
        const { data, error } = await admin.rpc("vr_album_list", { p_token: token });
        if (error) return json({ ok: false, error: "rpc_failed" }, 500);
        if (!data || data.ok !== true) return json(data ?? { ok: false });

        const rows = (data.photos ?? []) as Array<Record<string, unknown>>;
        // Podpisujeme VÝHRADNĚ cesty tohoto alba (RPC už vrací jen album_id řádky).
        const paths = rows
          .map((r) => String(r.storage_path || ""))
          .filter((p) => p.startsWith(albumId + "/"));

        const urlByPath: Record<string, string> = {};
        if (paths.length) {
          const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrls(paths, SIGN_TTL);
          for (const s of signed ?? []) {
            if (s && !s.error && s.signedUrl && s.path) {
              urlByPath[s.path] = absStorageUrl(s.signedUrl);
            }
          }
        }
        const photos = rows.map((r) => ({
          ...r,
          url: urlByPath[String(r.storage_path)] || "",
        }));
        return json({ ok: true, album_id: albumId, photos });
      }

      /* ---------- upload: vydá SIGNED UPLOAD URL scopnutou na cestu tohoto alba ---------- */
      case "upload": {
        const ct = String(body.content_type || "").toLowerCase();
        const ext = EXT_BY_TYPE[ct];
        if (!ext) return json({ ok: false, error: "type_not_allowed" }, 415);

        const size = Number(body.size || 0);
        if (size && size > MAX_BYTES) return json({ ok: false, error: "too_big" }, 413);

        // cesta VŽDY v rámci album_id — nelze zapsat do cizího alba
        const path = `${albumId}/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await admin.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (error || !data) return json({ ok: false, error: "sign_failed" }, 500);

        return json({ ok: true, path, upload_url: absStorageUrl(data.signedUrl) });
      }

      /* ---------- add: zápis metadat po úspěšném uploadu (přes RPC, service_role) ---------- */
      case "add": {
        const p_storage_path = String(body.storage_path || "");
        // druhá pojistka: cesta musí patřit do tohoto alba (RPC to ověří taky)
        if (!p_storage_path.startsWith(albumId + "/")) {
          return json({ ok: false, error: "path_invalid" }, 400);
        }
        const p_uploader_label =
          body.uploader_label != null ? String(body.uploader_label).slice(0, 60) : null;
        const p_consent_marketing = body.consent_marketing === true;

        const { data, error } = await admin.rpc("vr_album_add", {
          p_token: token,
          p_storage_path,
          p_uploader_label,
          p_consent_marketing,
        });
        if (error) return json({ ok: false, error: "rpc_failed" }, 500);
        // Když metadata selžou, ukliď osiřelý objekt (jen v rámci alba).
        if (!data || data.ok !== true) {
          await admin.storage.from(BUCKET).remove([p_storage_path]).catch(() => {});
        }
        return json(data);
      }

      /* ---------- delete: smaže objekt + řádek (jen v rámci album_id) ---------- */
      case "delete": {
        const p_photo_id = String(body.photo_id || "");
        if (!p_photo_id) return json({ ok: false, error: "photo_id_required" }, 400);

        // RPC smaže řádek jen když id patří do album_id tokenu a vrátí storage_path
        const { data, error } = await admin.rpc("vr_album_delete", {
          p_token: token,
          p_photo_id,
        });
        if (error) return json({ ok: false, error: "rpc_failed" }, 500);
        if (!data || data.ok !== true) return json(data ?? { ok: false });

        const path = String(data.storage_path || "");
        // Nikdy nesmažeme nic mimo album_id.
        if (path.startsWith(albumId + "/")) {
          await admin.storage.from(BUCKET).remove([path]).catch(() => {});
        }
        return json({ ok: true });
      }

      /* ---------- set_consent: přepne consent_marketing řádku v rámci album_id ---------- */
      case "set_consent": {
        const p_photo_id = String(body.photo_id || "");
        const p_consent = body.consent === true;
        if (!p_photo_id) return json({ ok: false, error: "photo_id_required" }, 400);
        const { data, error } = await admin.rpc("vr_album_set_consent", {
          p_token: token,
          p_photo_id,
          p_consent,
        });
        if (error) return json({ ok: false, error: "rpc_failed" }, 500);
        return json(data);
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (_e) {
    return json({ ok: false, error: "internal" }, 500);
  }
});
