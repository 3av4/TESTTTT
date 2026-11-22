/**
 * حذف ويبهوك تلجرام (للعودة إلى polling في التطوير):
 *   npm run bot:delete
 */
import { deleteWebhook, getWebhookInfo } from "../server/bot/telegramApi.js";
import { logger } from "../server/logger.js";

const log = logger.child("webhook-delete");

async function main() {
  const result = await deleteWebhook();
  if (!result.ok) {
    log.error("فشل حذف الويبهوك", { description: result.description });
    process.exit(1);
  }
  const info = await getWebhookInfo();
  log.info("حُذف الويبهوك ✅", { currentUrl: (info.result as { url?: string })?.url || "(لا يوجد)" });
}

main().catch((error) => {
  log.error("خطأ", { error: String(error) });
  process.exit(1);
});
