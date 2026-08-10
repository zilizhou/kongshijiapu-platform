import type { PeoplePayload } from "./types";

/** 续修登记表识别出的单列成员（表中一列一人） */
export type FormOcrPerson = {
  name: string;
  alias?: string;
  sex?: "男" | "女";
  birthday?: string;
  deathday?: string;
  degree?: string;
  college?: string;
  company?: string;
  position?: string;
  professionalTitle?: string;
  phone?: string;
  spouse?: string;
  children?: string[];
  address?: string;
  groupHint?: string;
  notes?: string;
};

export type FormOcrSheetMeta = {
  branchText?: string;
  fillerName?: string;
  fillerPhone?: string;
};

export type FormOcrMatchStatus =
  | "unique"
  | "ambiguous"
  | "none"
  | "skipped";

export type FormOcrPreviewItem = {
  index: number;
  extracted: FormOcrPerson;
  matchStatus: FormOcrMatchStatus;
  matchedPeopleId?: number | null;
  candidates: Array<{
    id: number;
    name: string;
    sex: string;
    level: number | null;
    groupName: string | null;
    parentName: string | null;
  }>;
  payload: PeoplePayload;
  operation: "create" | "update";
  selected: boolean;
  warning?: string;
};
