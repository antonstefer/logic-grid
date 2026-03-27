import adapter from "@sveltejs/adapter-static";

export default {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "200.html",
    }),
    alias: {
      "logic-grid": "../logic-grid/src",
    },
    paths: {
      base: process.env.BASE_PATH || "",
    },
  },
};
