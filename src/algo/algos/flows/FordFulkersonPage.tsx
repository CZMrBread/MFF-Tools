/**
 * Fordův–Fulkersonův algoritmus (#/flow/ford-fulkerson, Průvodce 14.2, str. 353–358; párování 14.3,
 * obr. 14.6). Tenká vrstva nad společnou stránkou toků (flowPage.tsx).
 */
import { FlowModulePage } from "./flowPage";

export function FordFulkersonPage() {
  return <FlowModulePage kind="ff" />;
}
