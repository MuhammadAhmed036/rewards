/**
 * Languages for the customer's own screens: English, Spanish and Urdu (the latter reads right to left).
 * A customer picks a language; otherwise the business's locale decides; English is the fallback for any text not yet translated.
 * Dates and numbers always follow the chosen language, and amounts of money follow the business's currency.
 */

export const LOCALES = {
  en: { label: "English", dir: "ltr", intl: "en-GB" },
  es: { label: "Español", dir: "ltr", intl: "es-ES" },
  ur: { label: "اردو", dir: "rtl", intl: "ur-PK" },
} as const;
export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

const en = {
  language: "Language",
  card_join_title: "Get your loyalty card",
  card_join_subtitle: "It takes about 30 seconds",
  card_signin_title: "Sign in to your card",
  card_signin_subtitle: "Enter your email & password to view balance and rewards",
  tab_new: "New here",
  tab_signin: "Sign In",
  join_google: "Join with Google",
  signin_google: "Sign in with Google",
  or_with_email: "or with email",
  email_address: "Email Address",
  name_optional: "Your Name (Optional)",
  password_create_optional: "Create Password (Optional)",
  password: "Password",
  get_my_card: "Get my card",
  creating_card: "Creating your card...",
  forgot_password: "Forgot password?",
  signin_view_pass: "Sign In to View Pass →",
  signing_in: "Signing In...",
  show_qr: "Show my QR code",
  recent_activity: "Recent activity",
  rewards_you_can_get: "Rewards you can get",
  you_have: "You have {n} {unit} here",
  you_get: "You get {rule}.",
  invite_text: "Invite a friend: you both get {n} {unit} after their first purchase.",
  copy_invite: "Copy my invite link",
  link_copied: "Link copied",
  offline: "You're offline. Points can't be added or spent until you're back online. Nothing was changed.",
  points: "points",
  stamps: "stamps",
  terms_title: "{name} loyalty card terms",
  terms_translated_note: "This is a translation. If anything differs, the English version applies.",
  terms_read_in: "Read in",
};
export type MessageKey = keyof typeof en;

const es: Record<MessageKey, string> = {
  language: "Idioma",
  card_join_title: "Consigue tu tarjeta de fidelidad",
  card_join_subtitle: "Solo lleva unos 30 segundos",
  card_signin_title: "Inicia sesión en tu tarjeta",
  card_signin_subtitle: "Introduce tu correo y contraseña para ver tu saldo y tus premios",
  tab_new: "Soy nuevo",
  tab_signin: "Iniciar sesión",
  join_google: "Unirme con Google",
  signin_google: "Iniciar sesión con Google",
  or_with_email: "o con correo electrónico",
  email_address: "Correo electrónico",
  name_optional: "Tu nombre (opcional)",
  password_create_optional: "Crea una contraseña (opcional)",
  password: "Contraseña",
  get_my_card: "Obtener mi tarjeta",
  creating_card: "Creando tu tarjeta...",
  forgot_password: "¿Olvidaste tu contraseña?",
  signin_view_pass: "Iniciar sesión para ver mi tarjeta →",
  signing_in: "Iniciando sesión...",
  show_qr: "Mostrar mi código QR",
  recent_activity: "Actividad reciente",
  rewards_you_can_get: "Premios que puedes conseguir",
  you_have: "Tienes {n} {unit} aquí",
  you_get: "Obtienes {rule}.",
  invite_text: "Invita a un amigo: los dos recibís {n} {unit} tras su primera compra.",
  copy_invite: "Copiar mi enlace de invitación",
  link_copied: "Enlace copiado",
  offline: "Estás sin conexión. No se pueden añadir ni gastar puntos hasta que vuelvas a conectarte. No se ha cambiado nada.",
  points: "puntos",
  stamps: "sellos",
  terms_title: "Condiciones de la tarjeta de fidelidad de {name}",
  terms_translated_note: "Esta es una traducción. Si algo difiere, se aplica la versión en inglés.",
  terms_read_in: "Leer en",
};

const ur: Record<MessageKey, string> = {
  language: "زبان",
  card_join_title: "اپنا لائلٹی کارڈ حاصل کریں",
  card_join_subtitle: "اس میں تقریباً 30 سیکنڈ لگتے ہیں",
  card_signin_title: "اپنے کارڈ میں سائن اِن کریں",
  card_signin_subtitle: "اپنا بیلنس اور انعامات دیکھنے کے لیے ای میل اور پاس ورڈ لکھیں",
  tab_new: "نیا صارف",
  tab_signin: "سائن اِن",
  join_google: "گوگل سے شامل ہوں",
  signin_google: "گوگل سے سائن اِن کریں",
  or_with_email: "یا ای میل سے",
  email_address: "ای میل ایڈریس",
  name_optional: "آپ کا نام (اختیاری)",
  password_create_optional: "پاس ورڈ بنائیں (اختیاری)",
  password: "پاس ورڈ",
  get_my_card: "میرا کارڈ بنائیں",
  creating_card: "آپ کا کارڈ بن رہا ہے...",
  forgot_password: "پاس ورڈ بھول گئے؟",
  signin_view_pass: "کارڈ دیکھنے کے لیے سائن اِن کریں ←",
  signing_in: "سائن اِن ہو رہا ہے...",
  show_qr: "میرا QR کوڈ دکھائیں",
  recent_activity: "حالیہ سرگرمی",
  rewards_you_can_get: "انعامات جو آپ حاصل کر سکتے ہیں",
  you_have: "یہاں آپ کے پاس {n} {unit} ہیں",
  you_get: "آپ کو {rule} ملتا ہے۔",
  invite_text: "دوست کو بلائیں: اس کی پہلی خریداری کے بعد آپ دونوں کو {n} {unit} ملیں گے۔",
  copy_invite: "میرا دعوتی لنک کاپی کریں",
  link_copied: "لنک کاپی ہو گیا",
  offline: "آپ آف لائن ہیں۔ دوبارہ آن لائن ہونے تک پوائنٹس شامل یا خرچ نہیں ہو سکتے۔ کچھ تبدیل نہیں ہوا۔",
  points: "پوائنٹس",
  stamps: "اسٹیمپس",
  terms_title: "{name} لائلٹی کارڈ کی شرائط",
  terms_translated_note: "یہ ترجمہ ہے۔ اگر کوئی فرق ہو تو انگریزی ورژن لاگو ہوگا۔",
  terms_read_in: "اس زبان میں پڑھیں",
};

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, es, ur };

/** The text for a key in a language, with `{name}` style placeholders filled in. Falls back to English. */
export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = MESSAGES[lang]?.[key] || en[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** "es-ES" -> "es"; anything we have no translation for becomes English. */
export function langFromLocale(locale: string | null | undefined): Lang {
  const base = (locale ?? "").toLowerCase().split(/[-_]/)[0];
  return (LANGS as string[]).includes(base) ? (base as Lang) : "en";
}

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as string[]).includes(v);

export function formatDate(lang: Lang, date: Date | string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat(LOCALES[lang].intl, options).format(new Date(date));
}

export function formatNumber(lang: Lang, n: number) {
  return new Intl.NumberFormat(LOCALES[lang].intl).format(n);
}

/** Money follows the language's number style and the business's own currency. */
export function formatMoney(lang: Lang, minor: number, currency: string) {
  return new Intl.NumberFormat(LOCALES[lang].intl, { style: "currency", currency }).format(minor / 100);
}
