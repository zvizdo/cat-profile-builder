"use client";
import { useCallback, useState } from "react";
import { writeAddress } from "@/core/fundraiser/address";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { describeProgress, progress } from "@/core/fundraiser/progress";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import styles from "@/ui/fundraiser/fundraiser.module.css";
import { EditRow } from "@/ui/fundraiser/EditRow";
import { Figures, type AmountsEditing } from "@/ui/fundraiser/Figures";
import { FullscreenButton } from "@/ui/fundraiser/FullscreenButton";
import { HeadlineField, type HeadlineEditing } from "@/ui/fundraiser/HeadlineField";
import { DISPLAY, EDIT, meterValuetext, updatedStatus } from "@/ui/fundraiser/strings";
import { Thermometer } from "@/ui/fundraiser/Thermometer";
import { useEditSession, type EditSession } from "@/ui/fundraiser/use-edit-session";
import { useFullscreen } from "@/ui/fundraiser/use-fullscreen";
import { useHeldArrangement } from "@/ui/fundraiser/use-held-arrangement";
import { useWakeLock } from "@/ui/shared/use-wake-lock";

export interface FundraiserDisplayProps {
  /** The fundraiser the page address described, complete and valid (`readAddress`). */
  initial: Fundraiser;
  /** The address carried none of the three keys, so the starting hint is shown. */
  isBlank: boolean;
}

/** A session a person has taken up: the headline, or amounts that were clicked, focused or typed in. */
function isEditing(state: EditSession["state"]): boolean {
  return state.kind === "headline" || (state.kind === "amounts" && state.sticky);
}

/** The open `amounts` session as the figures show it, or `null` when no amounts are open. */
function amountsOf(session: EditSession): AmountsEditing | null {
  const { state } = session;
  if (state.kind !== "amounts") return null;
  return { raised: state.raised, goal: state.goal, refusals: state.refusals };
}

/** The open `headline` session as the heading shows it, or `null` when the headline is not open. */
function headlineOf(session: EditSession): HeadlineEditing | null {
  const { state } = session;
  if (state.kind !== "headline") return null;
  return { text: state.text, refusal: state.refusal };
}

/**
 * The words and figures of the left group: label, headline (a button in the editing view), the button over the thermometer
 * (placed over it by the stylesheet, and in the page here so Tab reaches it before the
 * amounts), the amount raised and the goal line, and the reserved edit row. In display state
 * `canEdit` is false and the button is not rendered at all. Every shown text is a plain text
 * node, so nothing in the address becomes markup.
 */
function Copy(props: { fundraiser: Fundraiser; session: EditSession; canEdit: boolean }) {
  const { fundraiser, session, canEdit } = props;
  const parts = describeProgress(fundraiser.raisedCents, fundraiser.goalCents);
  return (
    <div className={styles.copy}>
      <p className={styles.label}>{DISPLAY.label}</p>
      <HeadlineField
        headline={fundraiser.headline}
        editing={headlineOf(session)}
        canEdit={canEdit}
        button={session.headlineButton}
        field={session.field}
      />
      {canEdit ? (
        <button
          type="button"
          className={styles.thermometerButton}
          aria-label={EDIT.thermometerButton}
          data-figures
          // Out of the Tab order while the headline is open, so Tab from the headline field reaches
          // Done instead of focusing this button, which would open the amounts and end the headline.
          tabIndex={session.state.kind === "headline" ? -1 : undefined}
          {...session.amountsButton}
        />
      ) : null}
      <Figures parts={parts} editing={amountsOf(session)} field={session.field} />
      <EditRow state={session.state} done={session.done} />
    </div>
  );
}

/**
 * The fundraiser on show, and what changes it: a confirmed edit replaces the fundraiser, writes
 * the address (`replaceState`, never a new history entry), clears the starting hint for good, and
 * leaves the sentence the status line will say. The sentence is dropped when the next edit begins, so it is said once.
 */
function useEditedFundraiser(initial: Fundraiser, isBlank: boolean) {
  const [fundraiser, setFundraiser] = useState(initial);
  const [hintVisible, setHintVisible] = useState(isBlank);
  const [announcement, setAnnouncement] = useState("");
  const commit = useCallback(
    (changes: Partial<Fundraiser>): void => {
      const next = { ...fundraiser, ...changes };
      setFundraiser(next);
      setHintVisible(false);
      setAnnouncement(updatedStatus(describeProgress(next.raisedCents, next.goalCents)));
      window.history.replaceState(null, "", writeAddress(next));
    },
    [fundraiser],
  );
  return { fundraiser, hintVisible, announcement, setAnnouncement, commit };
}

/**
 * The fundraiser display: a full-screen night stage that draws the headline, the amount raised,
 * the goal and the thermometer, in two arrangements the stylesheet switches between (side by
 * side on a wide stage, a centred stack on a tall one). Everything the viewer reads is a plain
 * text node, so nothing in the address can become markup.
 *
 * In the editing view the Full screen button comes first in the page (so Tab starts there),
 * the headline is a button that opens it as an in-place field, the thermometer is a button that
 * opens the amount raised and the goal as in-place fields, and the starting hint shows while the address was blank. In display state (the browser is in full
 * screen) none of that is rendered at all, so nothing can take focus, and the edit session is
 * cleared as full screen starts. While a session is open the arrangement is held, so the soft
 * keyboard cannot flip a stack into side by side. The screen is kept awake the whole time.
 */
export function FundraiserDisplay({ initial, isBlank }: FundraiserDisplayProps) {
  const edited = useEditedFundraiser(initial, isBlank);
  const { fundraiser, announcement, setAnnouncement } = edited;
  const fullscreen = useFullscreen();
  const session = useEditSession(fundraiser, edited.commit, !fullscreen.active, () =>
    setAnnouncement(EDIT.idleClosed),
  );
  const shape = useHeldArrangement(session.state.kind !== "idle");
  useWakeLock();
  // The sentence is said once: it goes when the next real edit begins (state set while rendering).
  // A hover preview that the pointer resting on the figures brings back does not count.
  if (isEditing(session.state) && announcement !== "") setAnnouncement("");

  const { raisedCents, goalCents } = fundraiser;
  const parts = describeProgress(raisedCents, goalCents);
  const editing = !fullscreen.active;

  return (
    <main className={styles.stage}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.shape} ref={shape} data-shape {...session.stage}>
        {editing ? (
          <FullscreenButton supported={fullscreen.supported} enter={fullscreen.enter} />
        ) : null}
        <div className={styles.layout}>
          <div className={styles.left}>
            <Logo
              tone="white"
              height={LOGO_HEIGHT.carousel}
              alt={DISPLAY.logoAlt}
              className={styles.logo}
            />
            <Copy fundraiser={fundraiser} session={session} canEdit={editing} />
          </div>
          <div className={styles.thermometerBox} data-figures>
            <Thermometer
              progress={progress(raisedCents, goalCents)}
              raisedCents={raisedCents}
              goalCents={goalCents}
              valuetext={meterValuetext(parts)}
              highlighted={session.state.kind === "amounts"}
            />
          </div>
        </div>
      </div>
      {editing && edited.hintVisible ? <p className={styles.hint}>{DISPLAY.hint}</p> : null}
      {editing ? (
        <p role="status" className={styles.srOnly}>
          {announcement}
        </p>
      ) : null}
    </main>
  );
}
