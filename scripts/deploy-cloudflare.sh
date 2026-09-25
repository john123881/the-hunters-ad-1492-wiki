#!/usr/bin/env bash
set -e

# ==============================================================================
# The Hunters A.D. 1492 - 一鍵部署至 Cloudflare Workers & D1 資料庫
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE} 🚀 開始部署至 Cloudflare Workers & Remote D1...${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. 本地型別檢查與建置驗證
echo -e "\n${YELLOW}>>> [1/4] 執行前端型別檢查與打包建置...${NC}"
npm run build
echo -e "${GREEN}✔ 建置成功！${NC}"

# 2. 遠端 D1 結構遷移（Migrations）
echo -e "\n${YELLOW}>>> [2/4] 檢查並套用遠端 D1 Migrations...${NC}"
npx wrangler d1 migrations apply hunters-db --remote

# 3. 遠端 D1 資料匯入（Seed）
echo -e "\n${YELLOW}>>> [3/4] 匯入最新裝備資料庫至遠端 D1 (seeds/equipment_catalog.sql)...${NC}"
npx wrangler d1 execute hunters-db --remote --file=seeds/equipment_catalog.sql -y
echo -e "${GREEN}✔ 遠端 D1 資料同步完成！${NC}"

# 4. 發布至 Cloudflare Workers
echo -e "\n${YELLOW}>>> [4/4] 發布 Worker 與靜態資產至 Cloudflare...${NC}"
npx wrangler deploy
echo -e "${GREEN}✔ Cloudflare Workers 發布成功！${NC}"

# 5. 線上健康檢查驗證
echo -e "\n${BLUE}======================================================${NC}"
echo -e "${BLUE} 🔍 執行正式環境驗收檢查 (Production Verification)...${NC}"
echo -e "${BLUE}======================================================${NC}"

PROD_URL="https://the-hunters-ad-1492.boardgame-wiki.workers.dev"

echo -e "正在檢查健康狀態 API: ${PROD_URL}/api/health ..."
HEALTH_RES=$(curl -s "${PROD_URL}/api/health" || echo "")
echo "回應: $HEALTH_RES"

if [[ "$HEALTH_RES" == *"\"status\":\"ok\""* ]]; then
  echo -e "${GREEN}✔ API 健康檢查通過！${NC}"
else
  echo -e "${RED}✘ API 健康檢查異常，請至 Cloudflare 儀表板查看日誌。${NC}"
fi

echo -e "\n${GREEN}🎉 一鍵部署流程完成！${NC}"
echo -e "正式網站網址: ${GREEN}${PROD_URL}${NC}\n"
