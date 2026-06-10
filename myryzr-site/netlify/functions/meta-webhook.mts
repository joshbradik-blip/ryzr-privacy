import type { Config } from "@netlify/functions";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_VERIFY_TOKEN = Netlify.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "ryzr_webhook_verify";

async function supabaseInsert(table: string, rows: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Prefer": "resolution=ignore-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error("Supabase insert failed:", await res.text());
}

export default async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json() as {
      object: string;
      entry: Array<{
        id: string;
        changes?: Array<{
          value: {
            item?: string;
            comment_id?: string;
            post_id?: string;
            from?: { name: string; id: string };
            message?: string;
            created_time?: number;
          };
          field: string;
        }>;
        messaging?: Array<{
          sender: { id: string };
          recipient: { id: string };
          message?: { text?: string; mid?: string };
          timestamp?: number;
        }>;
      }>;
    };

    const rows: Record<string, unknown>[] = [];

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === "feed" && change.value.item === "comment") {
          const v = change.value;
          rows.push({
            platform: "facebook",
            comment_id: v.comment_id ?? `${Date.now()}`,
            post_id: v.post_id,
            from_name: v.from?.name,
            from_id: v.from?.id,
            message: v.message ?? "",
            comment_created_time: v.created_time
              ? new Date(v.created_time * 1000).toISOString()
              : new Date().toISOString(),
            status: "pending",
          });
        }
      }

      for (const msg of entry.messaging ?? []) {
        if (msg.message?.text) {
          rows.push({
            platform: "instagram",
            comment_id: msg.message.mid ?? `dm_${Date.now()}`,
            post_id: null,
            from_name: null,
            from_id: msg.sender.id,
            message: msg.message.text,
            comment_created_time: msg.timestamp
              ? new Date(msg.timestamp).toISOString()
              : new Date().toISOString(),
            status: "pending",
          });
        }
      }
    }

    if (rows.length > 0) {
      await supabaseInsert("agent_comments_queue", rows);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err) {
    console.error("meta-webhook error:", err);
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
};

export const config: Config = {
  path: "/api/meta-webhook",
};
