# Cloudflare Pages deployment

Create a Cloudflare Pages project from this repository with these settings:

- Root directory: `ADMIN`
- Build command: `npm run build`
- Build output directory: `dist`

The committed `.env.production` provides the public API URL used for production builds. You may also set the same Cloudflare Pages build variable explicitly:

```text
VITE_API_URL=https://api.adminafrodrygoods.shop
```

Do not add passwords, API keys, tokens, database connection strings, or other secrets as `VITE_*` variables. Vite bundles those variables into the published website.

The committed `public/_redirects` file is copied to `dist/_redirects` by Vite. It makes Cloudflare Pages serve `index.html` for browser-history routes such as `/dashboard` and `/products/all`.
