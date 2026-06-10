import type { Config } from "@netlify/functions";

const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_USER_TOKEN = Netlify.env.get("META_USER_TOKEN")!;
const META_APP_ID = Netlify.env.get("META_APP_ID")!;
const FB_PAGE_ID = Netlify.env.get("META_PAGE_ID")!;
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
  if (!res.ok) throw new Error(`Supabase insert failed: ${await res.text()}`);
}

async function supabasePatch(table: string, filter: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase patch failed: ${await res.text()}`);
}

async function getTodayAdSpendCents(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await supabaseGet<{ details: { budget_cents?: number } }>(
    `agent_actions?action_type=eq.boost&status=eq.completed&created_at=gte.${today}T00:00:00Z&select=details`
  );
  return rows.reduce((sum, r) => sum + (r.details?.budget_cents ?? 0), 0);
}

async function createBoostCampaign(postId: string, platform: string, budgetCents: number): Promise<string> {
  const campaignRes = await fetch(`https://graph.facebook.com/v19.0/act_${META_APP_ID}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `RYZR Auto-Boost ${postId.slice(-6)} ${new Date().toISOString().slice(0, 10)}`,
      objective: "POST_ENGAGEMENT",
      status: "ACTIVE",
      access_token: META_USER_TOKEN,
    }),
  });

  if (!campaignRes.ok) {
    const err = await campaignRes.json() as { error?: { message: string } };
    throw new Error(`Campaign creation failed: ${err.error?.message}`);
  }

  const campaign = await campaignRes.json() as { id: string };

  const endTime = new Date();
  endTime.setHours(23, 59, 59, 0);

  const adSetRes = await fetch(`https://graph.facebook.com/v19.0/act_${META_APP_ID}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Ad Set - ${postId.slice(-6)}`,
      campaign_id: campaign.id,
      daily_budget: budgetCents,
      billing_event: "IMPRESSIONS",
      optimization_goal: "POST_ENGAGEMENT",
      targeting: { geo_locations: { countries: ["US"] } },
      end_time: Math.floor(endTime.getTime() / 1000),
      promoted_object: { page_id: FB_PAGE_ID },
      status: "ACTIVE",
      access_token: META_USER_TOKEN,
    }),
  });

  if (!adSetRes.ok) {
    const err = await adSetRes.json() as { error?: { message: string } };
    throw new Error(`Ad set creation failed: ${err.error?.message}`);
  }

  const adSet = await adSetRes.json() as { id: string };

  const creative = platform === "facebook"
    ? { object_story_id: `${FB_PAGE_ID}_${postId}` }
    : { instagram_actor_id: Netlify.env.get("META_IG_ACCOUNT_ID"), object_story_id: postId };

  const adRes = await fetch(`https://graph.facebook.com/v19.0/act_${META_APP_ID}/ads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Ad - ${postId.slice(-6)}`,
      adset_id: adSet.id,
      creative: { creative_id: creative.object_story_id },
      status: "ACTIVE",
      access_token: META_USER_TOKEN,
    }),
  });

  if (!adRes.ok) {
    const err = await adRes.json() as { error?: { message: string } };
    throw new Error(`Ad creation failed: ${err.error?.message}`);
  }

  return campaign.id;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { post_id, platform, budget_cents } = await req.json() as {
      post_id: string;
      platform: string;
      budget_cents?: number;
    };

    if (!post_id || !platform) {
      return new Response(JSON.stringify({ error: "post_id and platform required" }), { status: 400 });
    }

    const spentToday = await getTodayAdSpendCents();
    const remaining = DAILY_BUDGET_CENTS - spentToday;

    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: "Daily ad budget cap reached", spent: spentToday, cap: DAILY_BUDGET_CENTS }), { status: 429 });
    }

    const boostBudget = Math.min(budget_cents ?? remaining, remaining);

    const adId = await createBoostCampaign(post_id, platform, boostBudget);

    await supabasePatch("agent_post_snapshots", `post_id=eq.${post_id}`, {
      is_boosted: true,
      boost_ad_id: adId,
    });

    await supabaseInsert("agent_actions", [{
      action_type: "boost",
      post_id,
      platform,
      details: { ad_id: adId, budget_cents: boostBudget },
      status: "completed",
    }]);

    return new Response(JSON.stringify({ ok: true, ad_id: adId, budget_cents: boostBudget }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("meta-boost error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/meta-boost",
};
