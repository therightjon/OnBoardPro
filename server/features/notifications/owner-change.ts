import { createNotifications } from "./services/notify";
import type { Candidate } from "@shared/schemas";

export async function emitOwnerChanged(params: {
  candidate: Candidate;
  previousOwnerId: string | null | undefined;
  newOwnerId: string | null | undefined;
  actorId?: string | null;
}) {
  const { candidate, previousOwnerId, newOwnerId, actorId } = params;
  const candidateName = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() || "Candidate";

  const basePayload = {
    candidate: {
      id: candidate.id,
      name: candidateName,
    }
  } as const;

  if (newOwnerId && newOwnerId !== previousOwnerId) {
    await createNotifications({
      type: "candidate.owner_changed",
      actorId: actorId ?? null,
      recipients: [newOwnerId],
      entity: { type: "candidate", id: candidate.id },
      payload: {
        ...basePayload,
        variant: "new",
      },
      visibility: "internal",
    });
  }

  if (previousOwnerId && previousOwnerId !== newOwnerId) {
    await createNotifications({
      type: "candidate.owner_changed",
      actorId: actorId ?? null,
      recipients: [previousOwnerId],
      entity: { type: "candidate", id: candidate.id },
      payload: {
        ...basePayload,
        variant: "former",
      },
      visibility: "internal",
    });
  }
}
