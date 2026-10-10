UPDATE items
SET image_url = substr(image_url, 1, length(image_url) - 4) || '.webp'
WHERE image_url LIKE '/images/items/%.png';
