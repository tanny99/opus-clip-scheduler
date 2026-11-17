import { NextResponse } from "next/server";
import { listSocialAccounts } from "@/lib/opusclip";
import { SOCIAL_ACCOUNTS } from "@/lib/accounts";

export async function GET() {
  try {
    const apiAccounts = await listSocialAccounts();
    if (apiAccounts.length > 0) {
      // Merge with hardcoded to preserve subAccountId for platforms that need it (e.g. Instagram)
      const merged = apiAccounts.map((a) => {
        const hardcoded = SOCIAL_ACCOUNTS.find((h) => h.postAccountId === a.postAccountId);
        return { ...a, subAccountId: a.subAccountId || hardcoded?.subAccountId };
      });
      return NextResponse.json({ accounts: merged });
    }
  } catch {}

  return NextResponse.json({ accounts: SOCIAL_ACCOUNTS });
}
