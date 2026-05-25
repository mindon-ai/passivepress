import "dotenv/config";
import { loginToXAndSaveSession } from "../lib/social/platforms/x.ts";

export async function runSocialXLogin() {
  const result = await loginToXAndSaveSession();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("social-x-login.ts")) {
  runSocialXLogin().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
