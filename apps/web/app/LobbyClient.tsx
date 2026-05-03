"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { createBoard, ensureAnonSession, joinBoard } from "../lib/api";
import styles from "./page.module.css";

function normalizeSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function LobbyClient() {
  const { push } = useRouter();
  const [slug, setSlug] = useState("");
  const [mode, setMode] = useState<"create" | "join">("join");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedSlug = useMemo(() => normalizeSlug(slug), [slug]);
  const canSubmit = normalizedSlug.length > 0 && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const session = await ensureAnonSession();
      if (mode === "create") {
        await createBoard(normalizedSlug, session.token);
      } else {
        await joinBoard(normalizedSlug, session.token);
      }
      push(`/board/${encodeURIComponent(normalizedSlug)}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to open board",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.lobby}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>TogetherDraw</p>
        <h1>Shared canvas for quick visual collaboration</h1>
        <p className={styles.summary}>
          Create a board, share its slug, and draw with everyone in the room.
        </p>
      </section>

      <form className={styles.joinPanel} onSubmit={handleSubmit}>
        <div className={styles.modeSwitch} role="tablist" aria-label="Board mode">
          <button
            aria-selected={mode === "join"}
            className={mode === "join" ? styles.activeMode : ""}
            onClick={() => setMode("join")}
            role="tab"
            type="button"
          >
            Join
          </button>
          <button
            aria-selected={mode === "create"}
            className={mode === "create" ? styles.activeMode : ""}
            onClick={() => setMode("create")}
            role="tab"
            type="button"
          >
            Create
          </button>
        </div>

        <label className={styles.slugField}>
          <span>Board slug</span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => setSlug(event.target.value)}
            placeholder="design-review"
            spellCheck={false}
            value={slug}
          />
        </label>

        <div className={styles.previewRow}>
          <span>Link</span>
          <code>{normalizedSlug ? `/board/${normalizedSlug}` : "/board/..."}</code>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button className={styles.submitButton} disabled={!canSubmit} type="submit">
          {isSubmitting ? (
            <Loader2 aria-hidden className={styles.spinIcon} size={18} />
          ) : mode === "create" ? (
            <Plus aria-hidden size={18} />
          ) : (
            <ArrowRight aria-hidden size={18} />
          )}
          {mode === "create" ? "Create board" : "Join board"}
        </button>
      </form>
    </main>
  );
}
