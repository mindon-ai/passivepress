import "dotenv/config";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const BASE_URL = () => `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Send a plain HTML-formatted text message to Telegram.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error("[Telegram] Token or Chat ID missing in .env");
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Telegram] Failed to send message: ${err}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[Telegram] Error sending message: ${err}`);
    return false;
  }
}

/**
 * Send a photo from a public URL with an HTML-formatted caption.
 * Falls back to sendTelegramMessage if the photo send fails (e.g. URL not yet public).
 */
export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string,
): Promise<boolean> {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error("[Telegram] Token or Chat ID missing in .env");
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL()}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Telegram] sendPhoto failed (${err}) — falling back to text message`);
      // Fallback: send as a text message with the image URL inline
      return sendTelegramMessage(`${caption}\n\n🖼 <a href="${photoUrl}">View featured image</a>`);
    }

    return true;
  } catch (err) {
    console.error(`[Telegram] Error sending photo: ${err}`);
    return sendTelegramMessage(`${caption}\n\n🖼 <a href="${photoUrl}">View featured image</a>`);
  }
}
