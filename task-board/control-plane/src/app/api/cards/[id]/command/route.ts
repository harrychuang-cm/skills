import { currentMemberId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IllegalTransitionError } from "@/lib/card-transitions";
import { approveReview, rerunCard } from "@/lib/human-actions";

/** 人工介入指令：{ command: "rerun" | "approve", note? }。非法轉移回 409，卡片不動。 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const memberId = await currentMemberId();
  if (!memberId) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { command?: string; note?: string } | null;
  if (body?.command !== "rerun" && body?.command !== "approve") {
    return Response.json({ error: "invalid-command" }, { status: 400 });
  }
  try {
    const card =
      body.command === "rerun"
        ? await rerunCard(prisma, memberId, id, body.note)
        : await approveReview(prisma, memberId, id, body.note);
    return Response.json({ card: { id: card.id, column: card.column } });
  } catch (error) {
    if (error instanceof IllegalTransitionError) {
      return Response.json({ error: "illegal-transition", from: error.current, event: error.event }, { status: 409 });
    }
    throw error;
  }
}
