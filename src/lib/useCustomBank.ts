// خطافات React لمزامنة بنك المقدم المخصص
import { useEffect, useState } from "react";
import { subscribeCustomTypes, subscribeCustomQuestions, type CustomQuestion } from "./customBank";
import type { CustomType } from "../types/game";

export function useCustomTypes(): CustomType[] {
  const [types, setTypes] = useState<CustomType[]>([]);
  useEffect(() => subscribeCustomTypes(setTypes), []);
  return types;
}

export function useCustomQuestions(): CustomQuestion[] {
  const [qs, setQs] = useState<CustomQuestion[]>([]);
  useEffect(() => subscribeCustomQuestions(setQs), []);
  return qs;
}
