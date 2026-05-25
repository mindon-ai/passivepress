const urls = [
  "https://dl.acm.org/doi/10.1145/3442188.3445922",
  "https://arxiv.org/abs/2210.13382",
  "https://arxiv.org/abs/2310.02207",
  "https://arxiv.org/abs/2405.13849",
  "https://arxiv.org/abs/2605.13849",
  "https://arxiv.org/abs/2605.14033",
  "https://arxiv.org/abs/2605.13880",
  "https://www.reddit.com/r/artificial/comments/1tew6gr/we_keep_saying_ai_understands_things_does_it_or/",
  "https://www.theverge.com/ai-artificial-intelligence/930236/ai-cybersecurity-updates-for-mdash-mythos-and-gpt-5-5",
  "https://www.reddit.com/r/LocalLLaMA/comments/1tbyyee/textgen_is_now_a_native_desktop_app_opensource/",
  "https://www.reddit.com/r/LocalLLaMA/comments/1tbi2n3/i_got_a_real_transformer_language_model_running/",
  "https://www.reddit.com/r/artificial/comments/1tc1hq0/anthropics_new_interpretability_tool_found_claude/",
  "https://www.anthropic.com/research",
];

for (const url of urls) {
  try {
    const r = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SecurityAudit/1.0)" },
    });
    const status = r.status;
    const flag = status === 200 ? "OK" : status === 301 || status === 302 ? "REDIRECT" : "WARN";
    console.log(`[${flag}] ${status} ${url}`);
  } catch (e) {
    console.log(`[ERR] ${url} -- ${e.message}`);
  }
}
console.log("\nDone.");
