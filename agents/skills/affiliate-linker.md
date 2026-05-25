# Affiliate Linker

Resolve affiliate placeholders into Markdown and collect link metadata.

Placeholder rules:
- `{{PRODUCT:ASIN:Name}}` becomes an inline Amazon affiliate hyperlink.
- `{{AFFILIATE_TABLE:ASIN,...}}` becomes a markdown comparison table with Product, Price, Rating, and Buy columns.
- `{{BUY_BUTTON:ASIN:Label}}` becomes a CTA link with the `.affiliate-cta` marker.
- `{{PRICE:ASIN}}` becomes the cached publish-time price.

Do not cloak links. Use plain Amazon `/dp/ASIN?tag=...` URLs when PA API does not return a detail URL.
