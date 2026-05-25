/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ads from "../ads.js";
import type * as affiliateLinks from "../affiliateLinks.js";
import type * as affiliateSettings from "../affiliateSettings.js";
import type * as agentSettings from "../agentSettings.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as lib_authz from "../lib/authz.js";
import type * as newsletter from "../newsletter.js";
import type * as posts from "../posts.js";
import type * as productCache from "../productCache.js";
import type * as roles from "../roles.js";
import type * as socialPosts from "../socialPosts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ads: typeof ads;
  affiliateLinks: typeof affiliateLinks;
  affiliateSettings: typeof affiliateSettings;
  agentSettings: typeof agentSettings;
  categories: typeof categories;
  crons: typeof crons;
  http: typeof http;
  images: typeof images;
  "lib/authz": typeof lib_authz;
  newsletter: typeof newsletter;
  posts: typeof posts;
  productCache: typeof productCache;
  roles: typeof roles;
  socialPosts: typeof socialPosts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
