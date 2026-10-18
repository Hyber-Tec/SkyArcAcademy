import { type PayPeriod, payPeriodLabel, periodId } from "@shared/pay/periods";
import { Check } from "lucide-react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useColors } from "@/theme";

/**
 * Which dates the payroll shows: one of the recent pay periods (the current one first, as the website's list), or a
 * custom range, whose first and last days are then chosen on the page.
 */
export function PeriodDialog({
  open,
  periods,
  selected,
  custom,
  onPeriod,
  onCustom,
  onClose,
}: {
  open: boolean;
  /** Newest first: the current pay period, then the ones before it. */
  periods: PayPeriod[];
  /** The pay period shown now; null while a custom range is. */
  selected: PayPeriod | null;
  custom: boolean;
  onPeriod: (p: PayPeriod) => void;
  onCustom: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const check = <Check size={18} color={colors.foreground} />;
  return (
    <Dialog
      open={open}
      onRequestClose={onClose}
      testID="payroll-periods"
      footer={
        <Button variant="outline" onPress={onClose} testID="payroll-periods-cancel">
          Cancel
        </Button>
      }
    >
      <T variant="heading">Pay period</T>
      <ListSection>
        {periods.map((p, i) => {
          const on = !custom && !!selected && periodId(p) === periodId(selected);
          const label = payPeriodLabel(p);
          return (
            <ListRow
              key={periodId(p)}
              title={label}
              subtitle={i === 0 ? "Current pay period" : undefined}
              right={on ? check : undefined}
              chevron={false}
              onPress={() => onPeriod(p)}
              accessibilityLabel={[label, i === 0 ? "current pay period" : null, on ? "shown" : null].filter(Boolean).join(", ")}
              testID={`payroll-period-${p.start}`}
            />
          );
        })}
        <ListRow
          title="Custom range"
          subtitle="Choose the first and last day"
          right={custom ? check : undefined}
          chevron={false}
          onPress={onCustom}
          accessibilityLabel={custom ? "Custom range, shown" : "Custom range"}
          testID="payroll-period-custom"
        />
      </ListSection>
    </Dialog>
  );
}
