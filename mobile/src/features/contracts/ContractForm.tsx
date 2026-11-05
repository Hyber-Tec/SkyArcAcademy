import { type ContractBlock, type ContractDocument, type Line, dollarsText, pricedChoice, signerField } from "@shared/contracts/document";
import {
  type ContractSigning,
  type ContractValues,
  RELATION_LABELS,
  SIGN_KEYS,
  checkContractSigning,
  missingParts,
  optionHeading,
  optionPrices,
  relationLabel,
  tuitionOf,
  tuitionText,
  typingDate,
  usDate,
} from "@shared/contracts/fill";
import type { ShownSigner, SignerRelation } from "@shared/contracts/types";
import { dateText } from "@shared/i18n";
import * as Haptics from "expo-haptics";
import { Check, Eraser } from "lucide-react-native";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, type TextInputProps, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { Field } from "@/components/Field";
import { ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useLang, useT } from "@/lib/lang";
import { radius, space, useColors } from "@/theme";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

/**
 * The academy's enrollment contract as a page of the app (docs/DECISIONS.md §33 and §34): its words as the manager
 * approved them (shared/src/contracts/document.ts), with the parts the family fills in where the paper has them (the
 * program chosen, a short card each, the office's suggestion marked and each price after the discounts; the boxes
 * checked, the initials, the student's and the signer's details), then the signature. The academy's own parts show as
 * the academy's: the discounts the office checked, its signature, the rest to fill in later. What's typed is checked as
 * the server checks it (shared/src/contracts/fill.ts).
 */

/** What the office set on the contract it sent, and the academy's signature: shown, never changed by the family. */
export interface Offer {
  /** The program the office suggested (the family may choose another). */
  suggested: string | null;
  academySigner: ShownSigner | null;
}

const NO_OFFER: Offer = { suggested: null, academySigner: null };

/** What the signing part holds beside the contract's fields. */
export interface SignState {
  /** The signer's name, asked only when the contract has no "= signer" field. */
  name: string;
  relation: SignerRelation | null;
  agree: boolean;
}

const str = (v: ContractValues[string] | undefined): string => (typeof v === "string" ? v : "");

/** The part of the contract a field or a signing part sits in, to scroll to it: its own block, or the one holding it. */
export function blockOfPart(doc: ContractDocument, id: string): string | null {
  for (const b of doc.blocks) {
    if ((b.kind === "choose" || b.kind === "check" || b.kind === "initials") && b.id === id) return b.id;
    if (b.kind === "fields" && b.fields.some((f) => f.id === id)) return b.id;
    if (b.kind === "sign" && b.by === "family" && id.startsWith("@")) return b.id;
  }
  return id.startsWith("@") ? SIGN_PART : null;
}

/** Where the signing part is when the contract has no [[sign: …]] of its own (a draft being written). */
const SIGN_PART = "@sign";

/** Some words, with their bold ones (inside a `T`). */
function Words({ line }: { line: Line }) {
  return (
    <>
      {line.map((r, i) =>
        r.bold ? (
          <Text key={i} style={styles.bold}>
            {r.text}
          </Text>
        ) : (
          r.text
        ),
      )}
    </>
  );
}

function Problem({ text }: { text?: string }) {
  return text ? (
    <T variant="small" tone="destructive">
      {text}
    </T>
  ) : null;
}

/** A square to check, as the website's checkbox. */
function Box({ on, invalid = false }: { on: boolean; invalid?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.box, { borderColor: on ? colors.primary : invalid ? colors.destructive : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
      {on ? <Check size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}
    </View>
  );
}

/** A section's bar, as the paper heads its information boxes: dark for the family's, red for the academy's. */
function Bar({ title, academy = false, note }: { title: string; academy?: boolean; note?: string }) {
  const colors = useColors();
  const color = academy ? "#ffffff" : colors.primaryForeground;
  return (
    <View style={[styles.bar, styles.barRow, { backgroundColor: academy ? colors.brandSolid : colors.primary }]}>
      <T variant="tiny" style={[styles.barText, styles.grow, { color }]}>
        {title}
      </T>
      {note ? (
        <T variant="tiny" style={{ color }}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

/** How each kind of field is typed: a date on the number pad, a phone number on the phone pad, an email in lower case. */
function inputProps(fill: string): TextInputProps {
  switch (fill) {
    case "date":
      return { keyboardType: "number-pad", placeholder: "MM/DD/YYYY", maxLength: 10 };
    case "phone":
      return { keyboardType: "phone-pad", autoComplete: "tel", textContentType: "telephoneNumber", maxLength: 30 };
    case "email":
      return { keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false, autoComplete: "email", textContentType: "emailAddress", maxLength: 200 };
    case "signer":
      return { autoCapitalize: "words", autoCorrect: false, autoComplete: "name", textContentType: "name", maxLength: 100 };
    case "student":
      return { autoCapitalize: "words", autoCorrect: false, maxLength: 100 };
    default:
      return { autoCapitalize: "sentences", maxLength: 200 };
  }
}

/** Where the family signs: their name (when the contract has no field for it), parent or guardian, the signature, the date, the agreement. */
function SignPart({
  label,
  firstName,
  today,
  needsName,
  sign,
  onSign,
  errors,
  pad,
}: {
  label: string;
  firstName: string;
  today: string;
  needsName: boolean;
  sign: SignState;
  onSign: (next: Partial<SignState>, clears: string) => void;
  errors: Record<string, string>;
  pad: RefObject<SignaturePadHandle | null>;
}) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  return (
    <View style={styles.signPart}>
      {label ? <T variant="label">{label}</T> : null}
      {needsName ? (
        <Field
          label={t("Your full name", "성명")}
          value={sign.name}
          onChangeText={(v) => onSign({ name: v }, SIGN_KEYS.name)}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={100}
          error={errors[SIGN_KEYS.name]}
          testID="signer-name"
        />
      ) : null}
      <ListSection title={t(`You are ${firstName}’s`, `${firstName} 학생과의 관계`)} testID="signer-relation">
        {(Object.keys(RELATION_LABELS) as SignerRelation[]).map((r) => (
          <ChoiceRow key={r} title={relationLabel(r, lang)} selected={sign.relation === r} onPress={() => onSign({ relation: r }, SIGN_KEYS.relation)} testID={`signer-${r}`} />
        ))}
      </ListSection>
      <Problem text={errors[SIGN_KEYS.relation]} />
      <View style={styles.padHead}>
        <T variant="label">{t("Your signature", "서명")}</T>
        <Button size="sm" variant="ghost" icon={<Eraser size={16} color={colors.foreground} />} onPress={() => pad.current?.clear()} testID="signature-clear">
          {t("Clear", "지우기")}
        </Button>
      </View>
      <SignaturePad ref={pad} invalid={!!errors[SIGN_KEYS.signature]} onChange={(ink) => ink && onSign({}, SIGN_KEYS.signature)} testID="signature-pad" />
      <Problem text={errors[SIGN_KEYS.signature]} />
      <T variant="small" tone="muted">
        {t(`Date: ${usDate(today)}`, `날짜: ${dateText(today, "long", "ko")}`)}
      </T>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sign.agree }} onPress={() => onSign({ agree: !sign.agree }, SIGN_KEYS.agree)} style={styles.checkRow} testID="signer-agree">
        <Box on={sign.agree} invalid={!!errors[SIGN_KEYS.agree]} />
        <View style={styles.grow}>
          <T variant="label">{t("I agree to sign this contract electronically", "이 계약서에 전자 서명하는 데 동의합니다")}</T>
          <T variant="small" tone="muted">
            {t("My typed name and the signature I drew are my signature on it.", "입력한 이름과 직접 그린 서명을 이 계약서의 제 서명으로 합니다.")}
          </T>
        </View>
      </Pressable>
      <Problem text={errors[SIGN_KEYS.agree]} />
    </View>
  );
}

/** One block of the contract: its words, or a part to fill in. */
function Block({
  block,
  doc,
  values,
  onValue,
  errors,
  sign,
  offer,
  today,
}: {
  block: ContractBlock;
  doc: ContractDocument;
  values: ContractValues;
  onValue: (id: string, value: string | string[]) => void;
  errors: Record<string, string>;
  sign: ReactNode;
  offer: Offer;
  today: string;
}) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  switch (block.kind) {
    case "heading":
      return (
        <T variant="label" style={[styles.heading, { color: colors.brandText }]} accessibilityRole="header">
          {block.text}
        </T>
      );
    case "subheading":
      return (
        <T variant="small" style={[styles.subheading, { color: colors.brandText }]} accessibilityRole="header">
          {block.text}
        </T>
      );
    case "paragraph":
      return (
        <T style={styles.paragraph}>
          <Words line={block.text} />
        </T>
      );
    case "bullets":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <View style={[styles.dot, { backgroundColor: colors.brand }]} />
              <T style={[styles.grow, styles.paragraph]}>
                <Words line={item} />
              </T>
            </View>
          ))}
        </View>
      );
    case "numbered":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <T style={[styles.number, styles.paragraph]}>{item.n}</T>
              <T style={[styles.grow, styles.paragraph]}>
                <Words line={item.text} />
              </T>
            </View>
          ))}
        </View>
      );
    case "box":
      return (
        <View style={[styles.boxed, { borderColor: colors.border, backgroundColor: colors.cardMuted }]}>
          {block.lines.map((line, i) => (
            <T key={i} variant={i ? "small" : "body"} tone={i ? "muted" : "default"} style={styles.center}>
              <Words line={line} />
            </T>
          ))}
        </View>
      );
    case "choose":
      return <Choose block={block} doc={doc} values={values} onValue={onValue} error={errors[block.id]} suggested={offer.suggested} />;
    case "check": {
      const list = Array.isArray(values[block.id]) ? (values[block.id] as string[]) : [];
      if (block.by === "academy") {
        // The office checked these as it sent the contract: the family reads them, and asks the office about a change.
        const choice = pricedChoice(doc);
        const option = choice ? (values[choice.id] as string | undefined) : undefined;
        return (
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]} testID="contract-academy-check">
            <Bar title={block.label} academy note={t("Set by the academy", "아카데미가 정함")} />
            {block.options.map((o, i) => {
              const on = list.includes(o.id);
              const left = on && !!option && o.except.includes(option);
              return (
                <View key={o.id} style={[styles.checkRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`contract-discount-${o.id}`}>
                  <Box on={on} />
                  <View style={styles.grow}>
                    <T tone={on ? "default" : "muted"}>{o.text}</T>
                    {left ? (
                      <T variant="small" tone="muted">
                        {t("Doesn’t apply to the program chosen.", "고른 프로그램에는 적용되지 않아요.")}
                      </T>
                    ) : null}
                  </View>
                  {on && o.amount !== null && !left ? (
                    <T variant="label" style={styles.price}>
                      −{dollarsText(o.amount)}
                    </T>
                  ) : null}
                </View>
              );
            })}
            <View style={[styles.sectionFoot, { borderTopColor: colors.border, backgroundColor: colors.cardMuted }]}>
              <T variant="small" tone="muted">
                {lang === "ko"
                  ? `${list.length ? "아카데미가 적용한 할인이에요." : "적용한 할인이 없어요."} 바꿔야 할 항목이 있으면 아카데미에 문의해 주세요.`
                  : `${list.length ? "The academy applied these." : "None applied."} Ask the academy if one should change.`}
              </T>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.part}>
          <T variant="label">{block.label}</T>
          <T variant="small" tone="muted">
            {t("Check any that apply.", "해당하는 항목을 모두 체크해 주세요.")}
          </T>
          <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {block.options.map((o, i) => {
              const on = list.includes(o.id);
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => onValue(block.id, on ? list.filter((x) => x !== o.id) : [...list, o.id])}
                  style={({ pressed }) => [styles.checkRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
                  testID={`contract-check-${o.id}`}
                >
                  <Box on={on} />
                  <T style={styles.grow}>{o.text}</T>
                </Pressable>
              );
            })}
          </View>
          <Problem text={errors[block.id]} />
        </View>
      );
    }
    case "initials":
      return (
        <View style={styles.part}>
          <Field
            label={block.label}
            value={str(values[block.id])}
            onChangeText={(v) => onValue(block.id, v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            error={errors[block.id]}
            style={styles.initials}
            testID="contract-initials"
          />
        </View>
      );
    case "fields":
      return block.by === "family" ? (
        <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Bar title={block.title} />
          <View style={styles.sectionBody}>
            {block.fields.map((f) => (
              <Field
                key={f.id}
                label={f.label}
                value={str(values[f.id])}
                onChangeText={(v) => onValue(f.id, f.fill === "date" ? typingDate(v) : v)}
                error={errors[f.id]}
                testID={`contract-field-${f.id}`}
                {...inputProps(f.fill)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Bar title={block.title} academy />
          <View style={styles.sectionBody}>
            <T variant="small" tone="muted">
              {t("Filled in by the academy.", "아카데미가 작성해요.")}
            </T>
            {block.fields.map((f) => (
              <View key={f.id} style={styles.readRow}>
                <T variant="small" style={styles.bold}>
                  {f.label}
                </T>
                <View style={[styles.blank, { borderBottomColor: colors.border }]} />
              </View>
            ))}
          </View>
        </View>
      );
    case "sign":
      return block.by === "family" ? (
        sign
      ) : (
        <View style={styles.academySign} testID="contract-academy-sign">
          {offer.academySigner?.image ? (
            <View style={styles.academyInk}>
              <Image
                source={{ uri: offer.academySigner.image }}
                style={styles.academyImage}
                resizeMode="contain"
                accessibilityLabel={t(`${offer.academySigner.name}’s signature`, `${offer.academySigner.name} 서명`)}
              />
            </View>
          ) : offer.academySigner ? (
            // No image yet: their name typed, as the PDF prints it (§35).
            <View style={styles.academyInk} testID="typed-signature">
              <Text style={styles.typedName}>{offer.academySigner.name}</Text>
            </View>
          ) : null}
          <View style={[styles.blank, { borderBottomColor: colors.border }]} />
          <T variant="small" tone="muted">
            {block.label}
          </T>
          <T variant="small" tone="muted">
            {offer.academySigner
              ? t(
                  `Signed for the academy by ${[offer.academySigner.name, offer.academySigner.title].filter(Boolean).join(", ")}, as you sign. Date: ${usDate(today)}`,
                  `아카데미 대표 서명: ${[offer.academySigner.name, offer.academySigner.title].filter(Boolean).join(", ")}. 학부모님이 서명할 때 함께 들어가요. 날짜: ${dateText(today, "long", "ko")}`,
                )
              : t("Signed by the academy, with the date.", "아카데미가 날짜와 함께 서명해요.")}
          </T>
        </View>
      );
  }
}

/**
 * The programs to choose from, a short card each (the owner, 2026-11-05: "make each card better… straightforward"):
 * its name over the rest of it, its price after the discounts the office checked (the price before them struck
 * through), the office's suggestion marked; the one chosen opens to its details. Under them, what was chosen and its
 * price, as the paper's boxes have them.
 */
function Choose({
  block,
  doc,
  values,
  onValue,
  error,
  suggested,
}: {
  block: Extract<ContractBlock, { kind: "choose" }>;
  doc: ContractDocument;
  values: ContractValues;
  onValue: (id: string, value: string | string[]) => void;
  error?: string;
  suggested: string | null;
}) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const chosen = block.options.find((o) => o.id === values[block.id]);
  const priced = pricedChoice(doc) === block;
  const prices = priced ? optionPrices(doc, values) : null;
  const tuition = priced ? tuitionOf(doc, values) : null;
  return (
    <View style={styles.part}>
      <T variant="label">{block.label}</T>
      <T variant="small" tone="muted">
        {t("Choose one. Tap a program to see what it includes.", "하나를 골라 주세요. 프로그램을 누르면 포함된 내용을 볼 수 있어요.")}
      </T>
      {block.options.map((o) => {
        const on = chosen?.id === o.id;
        const { name, sub } = optionHeading(o.title);
        const price = prices?.get(o.id);
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}, ${price ? `${price.now} ${price.per}` : o.price}${suggested === o.id ? t(", suggested by the academy", ", 아카데미 추천") : ""}`}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync().catch(() => undefined);
              onValue(block.id, o.id);
            }}
            style={({ pressed }) => [
              styles.option,
              { borderColor: on ? colors.primary : error ? colors.destructive : colors.border, backgroundColor: on ? colors.secondary : pressed ? colors.accent : colors.card },
              on && styles.optionOn,
            ]}
            testID={`contract-choose-${o.id}`}
          >
            <View style={styles.optionHead}>
              <View style={[styles.mark, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                {on ? <Check size={13} color={colors.primaryForeground} strokeWidth={3} /> : null}
              </View>
              <View style={styles.grow}>
                <T variant="label" style={styles.optionName}>
                  {name}
                </T>
                {sub ? (
                  <T variant="tiny" tone="muted" style={styles.optionSub}>
                    {sub}
                  </T>
                ) : null}
              </View>
              {o.price ? (
                <View style={styles.priceBox}>
                  {price?.was ? (
                    <T variant="tiny" tone="muted" style={styles.was}>
                      {price.was}
                    </T>
                  ) : null}
                  <T variant="label" style={styles.now}>
                    {price ? price.now : o.price}
                  </T>
                  {price?.per ? (
                    <T variant="tiny" tone="muted">
                      {price.per}
                    </T>
                  ) : null}
                </View>
              ) : null}
            </View>
            {suggested === o.id ? (
              <View style={[styles.suggested, { backgroundColor: colors.brandTint }]} testID="contract-suggested">
                <T variant="tiny" style={[styles.suggestedText, { color: colors.brandText }]}>
                  {t("Suggested by the academy", "아카데미 추천")}
                </T>
              </View>
            ) : null}
            {on && o.lines.length ? (
              <View style={[styles.details, { borderTopColor: colors.border }]}>
                {o.lines.map((l, i) => (
                  <T key={i} variant="small" tone="muted">
                    {l}
                  </T>
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {chosen ? (
        <View style={[styles.boxed, styles.left, { borderColor: colors.border, backgroundColor: colors.cardMuted }]} testID="contract-chosen">
          <T variant="small">
            <Text style={styles.bold}>{block.label}:</Text> {chosen.title}
          </T>
          {block.priceLabel ? (
            <T variant="small">
              <Text style={styles.bold}>{block.priceLabel}:</Text> {tuition ? tuitionText(tuition, lang) : chosen.price}
            </T>
          ) : null}
        </View>
      ) : null}
      <Problem text={error} />
    </View>
  );
}

/**
 * The contract with its parts to fill in. Each part with something to fill records where it is (`positions`, by its
 * block's ID: `blockOfPart`), so the screen can scroll to one still missing.
 */
export function ContractForm({
  doc,
  values,
  onValue,
  sign,
  onSign,
  errors,
  firstName,
  today,
  pad,
  positions,
  offer = NO_OFFER,
}: {
  doc: ContractDocument;
  values: ContractValues;
  onValue: (id: string, value: string | string[]) => void;
  sign: SignState;
  onSign: (next: Partial<SignState>, clears: string) => void;
  errors: Record<string, string>;
  /** "Ava": whose parent or guardian signs. */
  firstName: string;
  /** The signature's date (YYYY-MM-DD), the academy's today. */
  today: string;
  pad: RefObject<SignaturePadHandle | null>;
  positions: RefObject<Record<string, number>>;
  offer?: Offer;
}) {
  const colors = useColors();
  const familySign = doc.blocks.find((b) => b.kind === "sign" && b.by === "family");
  const signPart = (label: string) => (
    <SignPart label={label} firstName={firstName} today={today} needsName={!signerField(doc)} sign={sign} onSign={onSign} errors={errors} pad={pad} />
  );
  const place = (id: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    positions.current[id] = e.nativeEvent.layout.y;
  };
  return (
    <View style={[styles.doc, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {doc.title ? (
        <T variant="heading" style={[styles.center, styles.title]}>
          {doc.title}
        </T>
      ) : null}
      {doc.blocks.map((b, i) => {
        const id = "id" in b ? b.id : null;
        return (
          <View key={id ?? `b${i}`} onLayout={id ? place(id) : undefined}>
            <Block block={b} doc={doc} values={values} onValue={onValue} errors={errors} sign={b.kind === "sign" && b.by === "family" ? signPart(b.label) : null} offer={offer} today={today} />
          </View>
        );
      })}
      {familySign ? null : <View onLayout={place(SIGN_PART)}>{signPart("")}</View>}
    </View>
  );
}

/**
 * The contract to fill in and sign, as a whole screen: what goes above it (`header`), the contract, what's still
 * missing (each a row that scrolls to it), the button, and what goes under it (`footer`). `onSubmit` gets the signing
 * once it passes the same checks as the server's, and answers with the server's field errors or a problem to show (or
 * nothing when it went through). `prefill` (what the records know, once read) fills only the fields still empty.
 */
export function ContractSheet({
  doc,
  firstName,
  today,
  initial,
  prefill = null,
  header,
  footer,
  submitLabel,
  submitTestID,
  onSubmit,
  insetTop = false,
  testID,
  offer = NO_OFFER,
}: {
  doc: ContractDocument;
  firstName: string;
  today: string;
  initial: ContractValues;
  prefill?: ContractValues | null;
  header: ReactNode;
  footer?: ReactNode;
  submitLabel: string;
  submitTestID: string;
  onSubmit: (signing: ContractSigning) => Promise<{ errors?: Record<string, string>; problem?: string } | void>;
  /** The screen has no header above it: keep clear of the status bar. */
  insetTop?: boolean;
  testID: string;
  /** What the office set on the contract it sent, and the academy's signature. */
  offer?: Offer;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const sig = prefill ? JSON.stringify(prefill) : "";
  const [values, setValues] = useState<ContractValues>(() => ({ ...prefill, ...initial }));
  const [merged, setMerged] = useState(sig);
  const [sign, setSign] = useState<SignState>({ name: "", relation: null, agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const formY = useRef(0);

  // What the records know arrives after the screen opens: it fills what's still empty, never what was typed.
  if (sig !== merged) {
    setMerged(sig);
    if (prefill) setValues((v) => ({ ...prefill, ...v }));
  }

  const clear = (id: string) => setErrors((e) => (e[id] ? { ...e, [id]: "" } : e));
  const onValue = (id: string, value: string | string[]) => {
    setValues((v) => ({ ...v, [id]: value }));
    clear(id);
  };
  const onSign = (next: Partial<SignState>, clears: string) => {
    setSign((s) => ({ ...s, ...next }));
    clear(clears);
  };
  const shown = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  const missing = missingParts(doc, shown, lang);

  const scrollTo = (id: string) => {
    const block = blockOfPart(doc, id);
    const y = block ? positions.current[block] : undefined;
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, formY.current + y - space.md), animated: true });
  };

  async function submit() {
    setProblem(null);
    const checked = checkContractSigning(doc, { values, name: sign.name, relation: sign.relation ?? "", signature: pad.current?.toPng() ?? "", agree: sign.agree }, lang);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const outcome = await onSubmit(checked.value);
      if (outcome?.errors) setErrors(outcome.errors);
      if (outcome?.problem) setProblem(outcome.problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={[styles.page, { paddingTop: (insetTop ? insets.top : 0) + space.lg, paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      testID={testID}
    >
      {header}
      <View onLayout={(e) => (formY.current = e.nativeEvent.layout.y)}>
        <ContractForm doc={doc} values={values} onValue={onValue} sign={sign} onSign={onSign} errors={shown} firstName={firstName} today={today} pad={pad} positions={positions} offer={offer} />
      </View>
      {missing.length ? (
        <View style={[styles.missing, { borderColor: colors.destructive, backgroundColor: colors.destructiveTint }]} testID="contract-missing">
          <T variant="label" tone="destructive">
            {t("Still to fill in", "아직 작성하지 않은 항목")}
          </T>
          {missing.map((m) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => scrollTo(m.id)} style={styles.missingRow} testID={`contract-missing-${m.id}`}>
              <T tone="destructive" style={styles.grow}>
                {m.label}
              </T>
              <T variant="small" tone="destructive">
                {t("Show", "보기")}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {problem ? <ErrorBox>{problem}</ErrorBox> : null}
      <Button size="lg" onPress={() => void submit()} busy={busy} wrap testID={submitTestID}>
        {submitLabel}
      </Button>
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg, paddingHorizontal: space.lg },
  doc: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  title: { marginBottom: space.xs },
  center: { textAlign: "center" },
  left: { alignItems: "flex-start" },
  bold: { fontWeight: "700" },
  grow: { flex: 1 },
  heading: { marginTop: space.md, fontWeight: "700", letterSpacing: 0.2 },
  subheading: { marginTop: space.xs, fontWeight: "700", letterSpacing: 0.3 },
  paragraph: { lineHeight: 22 },
  list: { gap: space.xs },
  item: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: radius.full, marginTop: 8, marginLeft: space.xs },
  number: { minWidth: 22 },
  boxed: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, gap: space.xs, alignItems: "center" },
  part: { gap: space.sm, marginTop: space.xs },
  option: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  optionOn: { borderWidth: 2, padding: space.md - 1 },
  optionHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  optionName: { fontWeight: "700", letterSpacing: 0.2 },
  optionSub: { letterSpacing: 0.6, marginTop: 1 },
  priceBox: { alignItems: "flex-end", minWidth: 64 },
  now: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  was: { textDecorationLine: "line-through", fontVariant: ["tabular-nums"] },
  suggested: { alignSelf: "flex-start", marginLeft: 22 + space.md, borderRadius: radius.full, paddingHorizontal: space.sm, paddingVertical: 2 },
  suggestedText: { fontWeight: "700" },
  details: { marginLeft: 22 + space.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, gap: 2 },
  mark: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  price: { fontVariant: ["tabular-nums"], textAlign: "right" },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  box: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  initials: { width: 140 },
  section: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: space.xs },
  bar: { paddingHorizontal: space.md, paddingVertical: space.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionFoot: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.sm },
  barText: { fontWeight: "700", letterSpacing: 0.6 },
  sectionBody: { padding: space.md, gap: space.md },
  readRow: { gap: space.xs },
  blank: { borderBottomWidth: 1, height: 18 },
  signPart: { gap: space.md, marginTop: space.sm },
  padHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  academySign: { gap: space.xs, marginTop: space.md },
  academyInk: { backgroundColor: "#ffffff", borderRadius: radius.md, alignSelf: "flex-start", paddingHorizontal: space.sm, paddingVertical: space.xs },
  academyImage: { width: 180, height: 48 },
  typedName: { fontFamily: Platform.select({ ios: "Times New Roman", default: "serif" }), fontStyle: "italic", fontSize: 24, color: "#18181b" },
  missing: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  missingRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs },
});
