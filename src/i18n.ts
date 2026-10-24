import type { InterfaceLanguage } from "./types";

let currentLanguage: InterfaceLanguage = "ru";

export function setInterfaceLanguage(language: InterfaceLanguage): void {
  currentLanguage = language;
}

export function t(russian: string, english: string): string {
  return currentLanguage === "en" ? english : russian;
}

export function getInterfaceLocale(): string {
  return currentLanguage === "en" ? "en-US" : "ru-RU";
}
