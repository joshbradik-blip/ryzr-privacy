import type { Config } from "@netlify/functions";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Netlify.env.get("ANTHROPIC_API_KEY")!;
const SITE_URL = Netlify.env.get("URL") ?? "https://www.myryzr.com";
const DAILY_BUDGET_CENTS = parseInt(Netlify.env.get("META_DAILY_AD_BUDGET") ?? "500", 10);

async function supabaseGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase get failed: ${await res.text()}`);
  return res.json();
}

async function supabaseInsert(table: string, rows: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error("Supabase insert failed:", await res.text());
}

interface PostSnapshot {
  id: string;
  post_id: string;
  platform: string;
  message: string | null;
  permalink: string | null;
  reach: number;
  impressions: number;
  engagement: number;
  likes: number;
  is_boosted: boolean;
  snapshot_at: string;
}

async function syncPosts() {
  const res = await fetch(`${SITE_URL}/api/meta-sync`, { method: "GET" });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}

async function analyzeAndBoost(posts: PostSnapshot[]) {
  if (posts.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const existingBoosts = await supabaseGet<{ details: { budget_cents?: number } }>(
    `agent_actions?action_type=eq.boost&status=eq.completed&created_at=gte.${today}T00:00:00Z&select=details`
  );
  const spentToday = existingBoosts.reduce((sum, r) => sum + (r.details?.budget_cents ?? 0), 0);
  const remaining = DAILY_BUDGET_CENTS - spentToday;

  if (remaining <= 0) {
    console.log("Daily budget cap reached, skipping boost analysis");
    return null;
  }

  const postSummary = posts
    .filter((p) => !p.is_boosted)
    .slice(0, 10)
    .map((p) => `[${p.platform}] "${(p.message ?? "").slice(0, 100)}" | reach:${p.reach} eng:${p.engagement} imp:${p.impressions}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `You are a social media marketing agent for RYZR, a fitness app. Analyze these recent posts and identify the single best one to boost as an ad today. Budget remaining: $${(remaining / 100).toFixed(2)}.\n\nPosts:\n${postSummary}\n\nRespond with JSON only:\n{"post_index": <0-based index of best post>, "reason": "<brief reason>", "recommended_budget_cents": <amount in cents, max ${remaining}>}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude analysis failed: ${res.status}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const rec = JSON.parse(jsonMatch[0]) as {
    post_index: number;
    reason: string;
    recommended_budget_cents: number;
  };

  const unboostedPosts = posts.filter((p) => !p.is_boosted);
  const targetPost = unboostedPosts[rec.post_index];

  if (!targetPost) return null;

  await supabaseInsert("agent_actions", [{
    action_type: "analyze",
    post_id: targetPost.post_id,
    platform: targetPost.platform,
    details: { reason: rec.reason, recommended_budget_cents: rec.recommended_budget_cents },
    status: "completed",
  }]);

  const boostRes = await fetch(`${SITE_URL}/api/meta-boost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post_id: targetPost.post_id,
      platform: targetPost.platform,
      budget_cents: Math.min(rec.recommended_budget_cents, remaining),
    }),
  });

  return boostRes.ok ? await boostRes.json() : null;
}

export default async (req: Request) => {
  try {
    console.log("Agent loop starting:", new Date().toISOString());

    await syncPosts();

    const posts = await supabaseGet<PostSnapshot>(
      "agent_post_snapshots?order=engagement.desc&limit=25"
    );

    const boostResult = await analyzeAndBoost(posts);

    console.log("Agent loop complete. Boost result:", boostResult);
  } catch (err) {
    console.error("Agent loop error:", err);
  }
};

export const config: Config = {
  schedule: "0 8,12,18 * * *",
};
