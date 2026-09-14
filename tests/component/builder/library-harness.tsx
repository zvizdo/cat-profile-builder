import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { ProfileDocument } from "@/core/profile/schema";
import { LibraryToasts } from "@/ui/builder/LibraryToasts";
import { MediaLibrary } from "@/ui/builder/MediaLibrary";
import { Rail, type RailProps } from "@/ui/builder/Rail";
import { useMediaLibrary, type MediaLibraryState } from "@/ui/builder/use-media-library";
import { ToastRegion } from "@/ui/shared/Toast";
import { DOC } from "./canvas-fixtures";

// The library and the rail over their own `useMediaLibrary`, as the shell owns it from
// T025, so the T022/T023 tests keep rendering them from a list of records. F38: the
// shell draws the library's toasts in its one stack, so the harness does the same.

/** The shell's stack with the library's toasts in it, as `Builder` renders them. */
export function HarnessToasts({ library }: { library: MediaLibraryState }) {
  return (
    <ToastRegion>
      <LibraryToasts library={library} />
    </ToastRegion>
  );
}

export interface LibraryHarnessProps {
  profileId: string;
  assets: AssetView[];
  /** The page the card reads its `On the page` line from (F39); an empty page by default. */
  doc?: ProfileDocument;
}

export function LibraryHarness({ profileId, assets, doc = DOC }: LibraryHarnessProps) {
  const library = useMediaLibrary(profileId, assets);
  return (
    <>
      <MediaLibrary profileId={profileId} library={library} doc={doc} />
      <HarnessToasts library={library} />
    </>
  );
}

export function RailHarness(props: Omit<RailProps, "library" | "doc"> & { assets: AssetView[] }) {
  const { assets, ...rest } = props;
  const library = useMediaLibrary(props.profileId, assets);
  return (
    <>
      <Rail {...rest} doc={DOC} library={library} />
      <HarnessToasts library={library} />
    </>
  );
}
