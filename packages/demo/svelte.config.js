import adapter from "@sveltejs/adapter-cloudflare";

export default {
  kit: {
    adapter: adapter(),
    alias: {
      "logic-grid": "../logic-grid/src",
      "logic-grid-ai": "../logic-grid-ai/src",
    },
    paths: {
      base: process.env.BASE_PATH || "",
    },
  },
};
