import { ScattScreen } from "@/features/scatt/ScattScreen";

/** A SCATT session as the staff watch it (the website deletes one filed under the wrong student). */
export default function StaffScattScreen() {
  return <ScattScreen allowed={() => true} backTo="/(app)/(staff)/(tabs)" testID="scatt-screen" />;
}
