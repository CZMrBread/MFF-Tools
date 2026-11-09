/**
 * Rovina k-d stromu: velikost v px (viewBox), okraj, převod souřadnic 0–100 ↔ px (osa y nahoru), rámeček
 * roviny v px a poloměr bodu – sdílí ji kresba (KdTreeViews.tsx) a tah (KdTreePage → usePlaneDrag).
 */
import { planeMapping } from "../../views/pointEdit";
import { PLANE } from "./kdtree";
import { planeFrame } from "./planeDrag";

export const KD_PLANE_S = 360;
export const KD_PLANE_PAD = 20;
/** viditelný poloměr bodu (px viewBoxu) – i úchop tahu se počítá od něj */
export const KD_PT_R = 5;
export const KD_MAP = planeMapping(KD_PLANE_S, KD_PLANE_PAD, PLANE);
/** rovina v px viewBoxu (meze tahu, poloha ×) */
export const KD_FRAME = planeFrame(KD_MAP, PLANE);
