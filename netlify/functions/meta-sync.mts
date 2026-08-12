import type { Config } from "@netlify/functions";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_USER_TOKEN = Netlify.env.get("META_USER_TOKEN")!;
const FB_PAGE_ID = Netlify.env.get("META_PAGE_ID")!;
const IG_ACCOUNT_ID = Netlify.env.get("META_IG_ACCOUNT_ID")!;

async function supabaseInsert(table: string, rows: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase insert failed: ${await res.text()}`);
}

async function supabaseUpsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${await res.text()}`);
}

async function fetchFacebookPosts() {
  const fields = "id,message,permalink_url,created_time,full_picture";
  const insightsFields = "post_impressions,post_reach,post_engaged_users,post_reactions_like_total,post_activity_by_action_type";
  const url = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/posts?fields=${fields}&limit=25&access_token=${META_USER_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FB posts fetch failed: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string; message?: string; permalink_url?: string; created_time?: string }> };

  const snapshots = [];
  for (const post of data.data || []) {
    const insightsUrl = `https://graph.facebook.com/v19.0/${post.id}/insights?metric=${insightsFields}&access_token=${META_USER_TOKEN}`;
    const insightsRes = await fetch(insightsUrl);
    const insights = insightsRes.ok ? await insightsRes.json() as { data: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }> } : { data: [] };

    const getMetric = (name: string): number => {
      const m = insights.data?.find((d) => d.name === name);
      const val = m?.values?.[0]?.value;
      if (typeof val === "number") return val;
      if (typeof val === "object" && val !== null) return Object.values(val).reduce((a, b) => a + b, 0);
      return 0;
    };

    snapshots.push({
      post_id: post.id,
      platform: "facebook",
      message: post.message?.slice(0, 500),
      permalink: post.permalink_url,
      post_created_time: post.created_time,
      reach: getMetric("post_reach"),
      impressions: getMetric("post_impressions"),
      engagement: getMetric("post_engaged_users"),
      likes: getMetric("post_reactions_like_total"),
      snapshot_at: new Date().toISOString(),
    });
  }
  return snapshots;
}

async function fetchInstagramPosts() {
  const fields = "id,caption,permalink,timestamp,like_count,comments_count";
  const url = `https://graph.facebook.com/v19.0/${IG_ACCOUNT_ID}/media?fields=${fields}&limit=25&access_token=${META_USER_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IG media fetch failed: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string; caption?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }> };

  const snapshots = [];
  for (const post of data.data || []) {
    const insightsUrl = `https://graph.facebook.com/v19.0/${post.id}/insights?metric=reach,impressions,engagement&access_token=${META_USER_TOKEN}`;
    const insightsRes = await fetch(insightsUrl);
    const insights = insightsRes.ok ? await insightsRes.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> } : { data: [] };

    const getMetric = (name: string): number => {
      const m = insights.data?.find((d) => d.name === name);
      return m?.values?.[0]?.value ?? 0;
    };

    snapshots.push({
      post_id: post.id,
      platform: "instagram",
      message: post.caption?.slice(0, 500),
      permalink: post.permalink,
      post_created_time: post.timestamp,
      reach: getMetric("reach"),
      impressions: getMetric("impressions"),
      engagement: getMetric("engagement"),
      likes: post.like_count ?? 0,
      comments_count: post.comments_count ?? 0,
      snapshot_at: new Date().toISOString(),
    });
  }
  return snapshots;
}

export default async (req: Request) => {
  try {
    const [fbSnaps, igSnaps] = await Promise.all([
      fetchFacebookPosts(),
      fetchInstagramPosts(),
    ]);

    const all = [...fbSnaps, ...igSnaps];
    if (all.length > 0) {
      await supabaseUpsert("agent_post_snapshots", all, "post_id");
    }

    await supabaseInsert("agent_actions", [{
      action_type: "sync",
      details: { fb_count: fbSnaps.length, ig_count: igSnaps.length },
      status: "completed",
    }]);

    return new Response(JSON.stringify({ ok: true, synced: all.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("meta-sync error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/meta-sync",
};
