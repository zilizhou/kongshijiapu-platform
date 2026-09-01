/** 家谱成员列表查询条件：写入 URL，并备份到 sessionStorage，便于「返回列表」恢复 */

export type PeopleListQuery = {
  name: string;
  fatherName: string;
  grandfatherName: string;
  pinyin: string;
  ziHao: string;
  q: string;
  no: string;
  level: string;
  group: string;
  sex: string;
  address: string;
  idCard: string;
  auditStatus: string;
  dataSource: string;
  feeStatus: string;
  page: number;
  pageSize: number;
};

export const emptyPeopleListQuery = (): PeopleListQuery => ({
  name: "",
  fatherName: "",
  grandfatherName: "",
  pinyin: "",
  ziHao: "",
  q: "",
  no: "",
  level: "",
  group: "",
  sex: "",
  address: "",
  idCard: "",
  auditStatus: "",
  dataSource: "",
  feeStatus: "",
  page: 1,
  pageSize: 10,
});

const STORAGE_KEY = "jiapu.peopleListQuery";

export function buildPeopleListSearch(q: PeopleListQuery): string {
  const sp = new URLSearchParams();
  if (q.name) sp.set("name", q.name);
  if (q.fatherName) sp.set("fatherName", q.fatherName);
  if (q.grandfatherName) sp.set("grandfatherName", q.grandfatherName);
  if (q.pinyin) sp.set("pinyin", q.pinyin);
  if (q.ziHao) sp.set("ziHao", q.ziHao);
  if (q.q) sp.set("q", q.q);
  if (q.no) sp.set("no", q.no);
  if (q.level) sp.set("level", q.level);
  if (q.group) sp.set("group", q.group);
  if (q.sex) sp.set("sex", q.sex);
  if (q.address) sp.set("address", q.address);
  if (q.idCard) sp.set("idCard", q.idCard);
  if (q.auditStatus) sp.set("auditStatus", q.auditStatus);
  if (q.dataSource) sp.set("dataSource", q.dataSource);
  if (q.feeStatus) sp.set("feeStatus", q.feeStatus);
  if (q.page > 1) sp.set("page", String(q.page));
  if (q.pageSize !== 10) sp.set("pageSize", String(q.pageSize));
  return sp.toString();
}

export function parsePeopleListSearch(
  sp: URLSearchParams | string,
): PeopleListQuery {
  const params =
    typeof sp === "string" ? new URLSearchParams(sp.replace(/^\?/, "")) : sp;
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 10);
  return {
    name: params.get("name") || "",
    fatherName: params.get("fatherName") || "",
    grandfatherName: params.get("grandfatherName") || "",
    pinyin: params.get("pinyin") || "",
    ziHao: params.get("ziHao") || "",
    q: params.get("q") || "",
    no: params.get("no") || "",
    level: params.get("level") || "",
    group: params.get("group") || "",
    sex: params.get("sex") || "",
    address: params.get("address") || "",
    idCard: params.get("idCard") || "",
    auditStatus: params.get("auditStatus") || "",
    dataSource: params.get("dataSource") || "",
    feeStatus: params.get("feeStatus") || "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10,
  };
}

export function savePeopleListQuery(search: string) {
  if (typeof window === "undefined") return;
  const q = search.replace(/^\?/, "");
  if (q) sessionStorage.setItem(STORAGE_KEY, q);
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function loadPeopleListQuery(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(STORAGE_KEY) || "";
}

/** 「返回列表」用：带上上次查询参数 */
export function peopleListHref(): string {
  const q = loadPeopleListQuery();
  return q ? `/people?${q}` : "/people";
}

export function hasPeopleListFilters(q: PeopleListQuery): boolean {
  return Boolean(
    q.name ||
      q.fatherName ||
      q.grandfatherName ||
      q.pinyin ||
      q.ziHao ||
      q.q ||
      q.no ||
      q.level ||
      q.group ||
      q.sex ||
      q.address ||
      q.idCard ||
      q.auditStatus ||
      q.dataSource ||
      q.feeStatus,
  );
}

export function needsMoreFilters(q: PeopleListQuery): boolean {
  return Boolean(q.pinyin || q.ziHao || q.q || q.no);
}
