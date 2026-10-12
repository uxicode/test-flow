export const CONTROL_KIND = {
  text: "text",
  password: "password",
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  date: "date",
  dateRange: "date_range",
  combobox: "combobox",
  file: "file",
} as const;

export type ControlKind = (typeof CONTROL_KIND)[keyof typeof CONTROL_KIND];

const CONTROL_ALIASES: Record<string, ControlKind> = {
  text: CONTROL_KIND.text,
  input: CONTROL_KIND.text,
  password: CONTROL_KIND.password,
  textarea: CONTROL_KIND.textarea,
  select: CONTROL_KIND.select,
  dropdown: CONTROL_KIND.select,
  radio: CONTROL_KIND.radio,
  checkbox: CONTROL_KIND.checkbox,
  check: CONTROL_KIND.checkbox,
  date: CONTROL_KIND.date,
  datepicker: CONTROL_KIND.date,
  date_range: CONTROL_KIND.dateRange,
  daterange: CONTROL_KIND.dateRange,
  combobox: CONTROL_KIND.combobox,
  "dropdown-button": CONTROL_KIND.combobox,
  file: CONTROL_KIND.file,
};

export function parseControlKind(raw: unknown): ControlKind | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return CONTROL_ALIASES[key];
}
