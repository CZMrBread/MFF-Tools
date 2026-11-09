/**
 * Dinicův algoritmus (#/flow/dinic, Průvodce 14.4, str. 361–366, obr. 14.7): vrstevnatá síť rezerv,
 * ČištěníSítě, BlokujícíTok. Tenká vrstva nad společnou stránkou toků (flowPage.tsx).
 */
import { FlowModulePage } from "./flowPage";

export function DinicPage() {
  return <FlowModulePage kind="dinic" />;
}
