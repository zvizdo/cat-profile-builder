"use client";

import { useState } from "react";
import { Button } from "@/ui/shared/Button";
import { Modal } from "@/ui/shared/Modal";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { Toast, ToastRegion, type ToastVariant } from "@/ui/shared/Toast";
import { Group, Panel } from "./KitPanel";

// The stateful half of the kit: the four toasts (dismissable, restorable), a toast in the
// real bottom-left region, and the remove-section modal — all with CONTENT.md's words.

const TOASTS: ReadonlyArray<{ variant: ToastVariant; text: string; action: string }> = [
  { variant: "success", text: "Gallery photo added.", action: "Undo" },
  { variant: "progress", text: "Uploading rain-day.mov — 2 of 3", action: "" },
  {
    variant: "warning",
    text: "That photo is 640px wide — too small for the hero.",
    action: "Use anyway",
  },
  { variant: "error", text: "Upload failed. Nothing was added.", action: "Try again" },
];

function noop() {}

function KitToast({
  variant,
  text,
  action,
  onDismiss,
}: (typeof TOASTS)[number] & { onDismiss: () => void }) {
  const offer = action === "" ? undefined : { label: action, onClick: noop };
  if (variant === "success") {
    return (
      <Toast variant="success" action={offer}>
        {text}
      </Toast>
    );
  }
  if (variant === "progress") {
    return (
      <Toast variant="progress" percent={68} onDismiss={onDismiss} dismissLabel="Dismiss">
        {text}
      </Toast>
    );
  }
  return (
    <Toast variant={variant} action={offer} onDismiss={onDismiss} dismissLabel="Dismiss">
      {text}
    </Toast>
  );
}

function ToastsPanel() {
  const [hidden, setHidden] = useState<ReadonlySet<ToastVariant>>(new Set());
  const [regionToast, setRegionToast] = useState(false);
  return (
    <Panel caption="Toasts · bottom-left, one at a time">
      <div className="flex flex-col gap-12">
        {TOASTS.filter((toast) => !hidden.has(toast.variant)).map((toast) => (
          <KitToast
            key={toast.variant}
            {...toast}
            onDismiss={() => setHidden(new Set([...hidden, toast.variant]))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-12">
        <Button variant="secondary" onClick={() => setRegionToast(true)}>
          Show a toast in the region
        </Button>
        {hidden.size === 0 ? null : (
          <Button variant="ghost" onClick={() => setHidden(new Set())}>
            Bring them back
          </Button>
        )}
      </div>
      <ToastRegion>
        {regionToast ? (
          <Toast variant="success" action={{ label: "Undo", onClick: () => setRegionToast(false) }}>
            Gallery photo added.
          </Toast>
        ) : null}
      </ToastRegion>
    </Panel>
  );
}

function ModalPanel() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Panel caption="Modal · only when the answer changes what happens">
      <p className="max-w-prose text-ui font-normal text-body">
        Open it, then Tab: focus stays inside. Escape keeps the gallery and puts focus back on the
        button that opened it.
      </p>
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Remove section
        </Button>
      </div>
      <Modal
        open={open}
        title="Remove the gallery?"
        body="Three photos come off Charlotte's page. They stay in your media library, and one undo brings the section back."
        safeAction={{ label: "Keep it", onClick: close }}
        dangerAction={{ label: "Remove section", onClick: close, destructive: true }}
      />
    </Panel>
  );
}

/** The add-section affordance, live: pressing it counts, so the press is seen to land. */
export function AddSection() {
  const [presses, setPresses] = useState(0);
  return (
    <div className="flex flex-col gap-8">
      <StripedPlaceholder
        as="button"
        label="+ add section"
        onClick={() => setPresses(presses + 1)}
      />
      <p className="text-ui-dense text-meta">
        {presses === 0
          ? "Not pressed yet."
          : `Pressed ${presses} ${presses === 1 ? "time" : "times"}.`}
      </p>
    </div>
  );
}

/** Toasts and the modal, live: dismiss, restore, open, close. */
export function NoticesGroup() {
  return (
    <Group title="Notices" note="Toasts report. Modals ask. Escape is always the safe button.">
      <ToastsPanel />
      <ModalPanel />
    </Group>
  );
}
