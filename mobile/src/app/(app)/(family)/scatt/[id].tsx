import { useFamily } from "@/features/family/FamilyProvider";
import { ScattScreen } from "@/features/scatt/ScattScreen";

/** A SCATT session as the family watches it: only their own students'. */
export default function FamilyScattScreen() {
  const family = useFamily();
  return <ScattScreen allowed={(studentId) => family.ids.includes(studentId)} backTo="/scores" testID="family-scatt-screen" />;
}
