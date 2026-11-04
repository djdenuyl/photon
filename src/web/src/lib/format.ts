// Small display helpers (Dutch).

export const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export const CATEGORY_LABELS: Record<string, string> = {
  familieweekend: "Familieweekend", sinterklaas: "Sinterklaas", kerst: "Kerst", "oud-en-nieuw": "Oud en nieuw",
  verjaardag: "Verjaardag", zomervakantie: "Zomervakantie", "korte-vakantie": "Korte vakantie",
  "weekendje-weg": "Weekendje weg", "dagje-uit": "Dagje uit", logeren: "Logeren", "mijlpaal-kind": "Mijlpaal kind",
  feestdag: "Feestdag", "feest-bruiloft": "Feest / bruiloft", "huis-tuin-klussen": "Huis en tuin",
  "bezoek-vrienden-familie": "Bezoek", "dagelijks-leven": "Dagelijks leven", "seizoen-natuur": "Seizoen / natuur",
  "werk-hobby": "Werk / hobby", anders: "Anders",
};

export const fmtDate = (d: string): string => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
export const fmtRange = (a: string, b: string): string => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);
export const num = (v: number): string => String(v).replace(".", ",");
