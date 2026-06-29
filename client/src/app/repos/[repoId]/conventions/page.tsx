/* Route: /repos/:repoId/conventions — Conventions list + judge + create skill.
   Thin entry; all view logic lives in _components/ConventionsView. */
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  return <ConventionsView />;
}
