import { redirect } from "next/navigation";

/**
 * The site root has no content of its own; every visit is sent to the public index at
 * `/cats`. Never renders.
 */
export default function Home(): never {
  redirect("/cats");
}
