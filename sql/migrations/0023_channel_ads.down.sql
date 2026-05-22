-- 0023 down — drop the channel_ads canonical table.
-- Schema xb_canonical stays (other tables live in it). RLS policy and
-- indexes drop with the table.

DROP TABLE IF EXISTS xb_canonical.channel_ads;
