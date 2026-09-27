-- 馬車自由備註：保存線索與不常態的團隊紀錄。
ALTER TABLE campaign_wagons ADD COLUMN notes TEXT NOT NULL DEFAULT '';
