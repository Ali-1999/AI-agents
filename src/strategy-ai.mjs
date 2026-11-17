export async function generateStrategy(env, messages, request = fetch) {
  if (!env.OPENROUTER_API_KEY) {
    const {response} = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {messages, max_tokens: 100});
    return typeof response === "string" ? JSON.parse(response) : response;
  }
  const model = env.OPENROUTER_MODEL?.trim() || "openrouter/free";
  if (model !== "openrouter/free" && !model.endsWith(":free")) {
    throw new Error("Choose a free OpenRouter model");
  }
  const response = await request("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {"Authorization": "Bearer " + env.OPENROUTER_API_KEY, "Content-Type": "application/json"},
    body: JSON.stringify({model, messages, max_tokens: 500}),
  });
  if (!response.ok) throw new Error("OpenRouter HTTP " + response.status);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter returned no strategy");
  return JSON.parse(content.trim().replace(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i, "$1"));
}
